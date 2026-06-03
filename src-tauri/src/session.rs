use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, OnceLock};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, Mutex, Notify};
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

// ── Ports ────────────────────────────────────────────────────────────────────

pub const WS_PORT: u16 = 4242;
const DISCOVERY_PORT: u16 = 4243;
const DISCOVERY_INTERVAL_SECS: u64 = 2;

// ── Public types (serialised to/from JS) ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub device: String, // "windows" | "mac"
    pub joined_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredSession {
    pub name: String,
    pub ip: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub mode: String, // "none" | "hosting" | "joined"
    pub session_name: String,
    pub pin: String,
    pub host_ip: String,
    pub peers: Vec<Peer>,
    pub local_ip: String,
}

// ── Global session state ──────────────────────────────────────────────────────

struct SessionState {
    mode: String,
    session_name: String,
    pin: String,
    host_ip: String,
    local_ip: String,
    current_show_json: String,
    peers: HashMap<String, Peer>,
    // Hosting only
    broadcast_tx: Option<broadcast::Sender<String>>,
    shutdown: Option<Arc<Notify>>,
    // Joining only
    ws_send_tx: Option<tokio::sync::mpsc::UnboundedSender<String>>,
    peer_id: String, // our ID when joined
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            mode: "none".to_string(),
            session_name: String::new(),
            pin: String::new(),
            host_ip: String::new(),
            local_ip: String::new(),
            current_show_json: String::new(),
            peers: HashMap::new(),
            broadcast_tx: None,
            shutdown: None,
            ws_send_tx: None,
            peer_id: String::new(),
        }
    }
}

static SESSION: OnceLock<Arc<Mutex<SessionState>>> = OnceLock::new();

fn sess() -> &'static Arc<Mutex<SessionState>> {
    SESSION.get_or_init(|| Arc::new(Mutex::new(SessionState::default())))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn get_ip_inner() -> Option<String> {
    // Connect a UDP socket to a public IP (never actually sends data) to find
    // the interface the OS would use for outbound traffic.
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_local_ip() -> Result<String, String> {
    get_ip_inner().ok_or_else(|| "Could not determine local IP".to_string())
}

// ─── Hosting ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_hosting(
    app: AppHandle,
    session_name: String,
    pin: String,
    _device_name: String,
) -> Result<String, String> {
    let local_ip = get_ip_inner().unwrap_or_else(|| "0.0.0.0".to_string());

    {
        let st = sess().lock().await;
        if st.mode != "none" {
            return Err("Already in a session. Stop or leave first.".to_string());
        }
    }

    let (broadcast_tx, _) = broadcast::channel::<String>(512);
    let shutdown = Arc::new(Notify::new());

    let listener = TcpListener::bind(format!("0.0.0.0:{}", WS_PORT))
        .await
        .map_err(|e| format!("Cannot start server on port {}: {}", WS_PORT, e))?;

    {
        let mut st = sess().lock().await;
        st.mode = "hosting".to_string();
        st.session_name = session_name.clone();
        st.pin = pin.clone();
        st.local_ip = local_ip.clone();
        st.host_ip = local_ip.clone();
        st.broadcast_tx = Some(broadcast_tx.clone());
        st.shutdown = Some(shutdown.clone());
    }

    // Spawn WebSocket accept loop
    {
        let app = app.clone();
        let sess = sess();
        let shutdown = shutdown.clone();
        let pin = pin.clone();
        let session_name = session_name.clone();
        let broadcast_tx = broadcast_tx.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = shutdown.notified() => break,
                    result = listener.accept() => {
                        match result {
                            Ok((stream, addr)) => {
                                let app = app.clone();
                                let sess = sess.clone();
                                let pin = pin.clone();
                                let session_name = session_name.clone();
                                let broadcast_tx = broadcast_tx.clone();
                                tokio::spawn(handle_peer(app, sess, stream, addr, pin, session_name, broadcast_tx));
                            }
                            Err(_) => break,
                        }
                    }
                }
            }
        });
    }

    // Spawn UDP discovery broadcaster
    {
        let shutdown = shutdown.clone();
        let session_name = session_name.clone();
        let local_ip = local_ip.clone();

        tokio::spawn(async move {
            if let Ok(socket) = tokio::net::UdpSocket::bind("0.0.0.0:0").await {
                let _ = socket.set_broadcast(true);
                let packet = serde_json::json!({
                    "type": "announce",
                    "name": session_name,
                    "ip": local_ip,
                    "port": WS_PORT,
                    "version": 1
                });
                let packet_bytes = serde_json::to_vec(&packet).unwrap_or_default();
                let target = format!("255.255.255.255:{}", DISCOVERY_PORT);

                loop {
                    tokio::select! {
                        _ = shutdown.notified() => break,
                        _ = tokio::time::sleep(tokio::time::Duration::from_secs(DISCOVERY_INTERVAL_SECS)) => {
                            let _ = socket.send_to(&packet_bytes, &target).await;
                        }
                    }
                }
            }
        });
    }

    Ok(local_ip)
}

async fn handle_peer(
    app: AppHandle,
    sess: Arc<Mutex<SessionState>>,
    stream: tokio::net::TcpStream,
    _addr: SocketAddr,
    expected_pin: String,
    session_name: String,
    broadcast_tx: broadcast::Sender<String>,
) {
    let ws = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(_) => return,
    };
    let (mut ws_write, mut ws_read) = ws.split();

    // ── Auth ──────────────────────────────────────────────────────────────────
    let auth_text = match ws_read.next().await {
        Some(Ok(Message::Text(t))) => t,
        _ => return,
    };

    let auth: serde_json::Value = match serde_json::from_str(&auth_text) {
        Ok(v) => v,
        Err(_) => return,
    };

    if auth["pin"].as_str() != Some(expected_pin.as_str()) {
        let _ = ws_write
            .send(Message::Text(
                serde_json::to_string(&serde_json::json!({"type":"auth_fail","reason":"Wrong PIN"}))
                    .unwrap(),
            ))
            .await;
        return;
    }

    let peer_id = uuid::Uuid::new_v4().to_string();
    let peer = Peer {
        id: peer_id.clone(),
        name: auth["name"].as_str().unwrap_or("Unknown").to_string(),
        device: auth["device"].as_str().unwrap_or("unknown").to_string(),
        joined_at: chrono_now(),
    };

    // ── Send auth_ok + current state ─────────────────────────────────────────
    let current_state = {
        let mut st = sess.lock().await;
        st.peers.insert(peer_id.clone(), peer.clone());
        st.current_show_json.clone()
    };

    let auth_ok = serde_json::json!({
        "type": "auth_ok",
        "session_name": session_name,
        "peer_id": peer_id
    });
    if ws_write
        .send(Message::Text(serde_json::to_string(&auth_ok).unwrap()))
        .await
        .is_err()
    {
        return;
    }

    // Send current show state to new peer
    if !current_state.is_empty() {
        let state_msg = serde_json::json!({
            "type": "state",
            "show_json": current_state,
            "sync_id": "",
            "ts": now_ms()
        });
        let _ = ws_write
            .send(Message::Text(serde_json::to_string(&state_msg).unwrap()))
            .await;
    }

    // Notify other peers and the host frontend
    let _ = app.emit("session:peer_joined", &peer);
    let join_bcast = serde_json::json!({"type":"peer_joined","peer": peer});
    let _ = broadcast_tx.send(format!("{}|||{}", peer_id, serde_json::to_string(&join_bcast).unwrap()));

    // ── Concurrent reader/writer ──────────────────────────────────────────────
    // mpsc to writer task so we can use the write half from two places
    let (writer_tx, mut writer_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Writer task: receives from mpsc, sends to WS
    tokio::spawn(async move {
        while let Some(msg) = writer_rx.recv().await {
            if ws_write.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Broadcast forwarder: subscribes to broadcast channel, forwards to this peer
    let writer_tx_bcast = writer_tx.clone();
    let my_peer_id = peer_id.clone();
    let mut rx = broadcast_tx.subscribe();
    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    // msg format: "sender_peer_id|||{json}"
                    if let Some(idx) = msg.find("|||") {
                        let sender = &msg[..idx];
                        if sender != my_peer_id {
                            let json = &msg[idx + 3..];
                            let _ = writer_tx_bcast.send(json.to_string());
                        }
                    }
                }
                Err(broadcast::error::RecvError::Closed) => break,
                Err(_) => {} // lagged — skip old messages
            }
        }
    });

    // Main reader loop: receive from this peer, update shared state, broadcast
    while let Some(Ok(msg)) = ws_read.next().await {
        if let Message::Text(text) = msg {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                if val["type"] == "state" {
                    if let Some(show_json) = val["show_json"].as_str() {
                        // Update host's stored state
                        {
                            let mut st = sess.lock().await;
                            st.current_show_json = show_json.to_string();
                        }
                        // Tell host's React frontend to apply this state
                        let _ = app.emit("session:state_received", serde_json::json!({
                            "show_json": show_json,
                            "sync_id": val["sync_id"].as_str().unwrap_or("")
                        }));
                        // Relay to all other peers
                        let relay = serde_json::json!({
                            "type": "state",
                            "show_json": show_json,
                            "sync_id": val["sync_id"].as_str().unwrap_or(""),
                            "ts": now_ms()
                        });
                        let _ = broadcast_tx.send(format!(
                            "{}|||{}",
                            peer_id,
                            serde_json::to_string(&relay).unwrap()
                        ));
                    }
                } else if val["type"] == "ping" {
                    let _ = writer_tx.send(r#"{"type":"pong"}"#.to_string());
                }
            }
        }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────
    {
        let mut st = sess.lock().await;
        st.peers.remove(&peer_id);
    }
    let _ = app.emit("session:peer_left", &peer_id);
    let leave_bcast = serde_json::json!({"type":"peer_left","id": peer_id});
    let _ = broadcast_tx.send(format!(
        "host|||{}",
        serde_json::to_string(&leave_bcast).unwrap()
    ));
}

#[tauri::command]
pub async fn stop_hosting() -> Result<(), String> {
    let mut st = sess().lock().await;
    if let Some(shutdown) = st.shutdown.take() {
        shutdown.notify_waiters();
    }
    *st = SessionState::default();
    Ok(())
}

// ─── Broadcasting state (called by host's React on any change) ────────────────

#[tauri::command]
pub async fn session_broadcast_state(state_json: String, sync_id: String) -> Result<(), String> {
    let mut st = sess().lock().await;
    st.current_show_json = state_json.clone();

    if st.mode == "hosting" {
        if let Some(tx) = &st.broadcast_tx {
            let msg = serde_json::json!({
                "type": "state",
                "show_json": state_json,
                "sync_id": sync_id,
                "ts": now_ms()
            });
            let _ = tx.send(format!("host|||{}", serde_json::to_string(&msg).unwrap()));
        }
    } else if st.mode == "joined" {
        if let Some(tx) = &st.ws_send_tx {
            let msg = serde_json::json!({
                "type": "state",
                "show_json": state_json,
                "sync_id": sync_id,
                "ts": now_ms()
            });
            let _ = tx.send(serde_json::to_string(&msg).unwrap());
        }
    }
    Ok(())
}

// ─── Joining ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn join_session(
    app: AppHandle,
    host_ip: String,
    port: u16,
    pin: String,
    device_name: String,
    device_type: String,
) -> Result<String, String> {
    {
        let st = sess().lock().await;
        if st.mode != "none" {
            return Err("Already in a session. Leave first.".to_string());
        }
    }

    let url = format!("ws://{}:{}", host_ip, port);

    let (ws_stream, _) = tokio_tungstenite::connect_async(&url)
        .await
        .map_err(|e| format!("Cannot connect to {}: {}", url, e))?;

    let (mut ws_write, mut ws_read) = ws_stream.split();

    // Send auth
    let auth_msg = serde_json::json!({
        "type": "auth",
        "pin": pin,
        "name": device_name,
        "device": device_type
    });
    ws_write
        .send(Message::Text(serde_json::to_string(&auth_msg).unwrap()))
        .await
        .map_err(|e| e.to_string())?;

    // Read auth response
    let resp_text = match ws_read.next().await {
        Some(Ok(Message::Text(t))) => t,
        _ => return Err("No response from host".to_string()),
    };

    let resp: serde_json::Value =
        serde_json::from_str(&resp_text).map_err(|e| e.to_string())?;

    match resp["type"].as_str() {
        Some("auth_ok") => {}
        Some("auth_fail") => {
            return Err(resp["reason"].as_str().unwrap_or("Auth failed").to_string())
        }
        _ => return Err("Unexpected response".to_string()),
    }

    let session_name = resp["session_name"].as_str().unwrap_or("").to_string();
    let session_name_ret = session_name.clone();
    let peer_id = resp["peer_id"].as_str().unwrap_or("").to_string();
    let local_ip = get_ip_inner().unwrap_or_default();

    // Set up send channel
    let (send_tx, mut send_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    {
        let mut st = sess().lock().await;
        st.mode = "joined".to_string();
        st.session_name = session_name;
        st.host_ip = host_ip.clone();
        st.local_ip = local_ip;
        st.peer_id = peer_id;
        st.ws_send_tx = Some(send_tx);
    }

    // Writer task
    tokio::spawn(async move {
        while let Some(msg) = send_rx.recv().await {
            if ws_write.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Reader task
    let app_clone = app.clone();
    let sess_arc = sess();

    tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_read.next().await {
            if let Message::Text(text) = msg {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                    match val["type"].as_str() {
                        Some("state") => {
                            if let Some(show_json) = val["show_json"].as_str() {
                                let sync_id = val["sync_id"].as_str().unwrap_or("").to_string();
                                let payload = serde_json::json!({
                                    "show_json": show_json,
                                    "sync_id": sync_id
                                });
                                let _ = app_clone.emit("session:state_received", payload);
                            }
                        }
                        Some("peer_joined") => {
                            let _ = app_clone.emit("session:peer_joined", &val["peer"]);
                        }
                        Some("peer_left") => {
                            let _ = app_clone.emit("session:peer_left", &val["id"]);
                        }
                        _ => {}
                    }
                }
            }
        }

        // Disconnected
        {
            let mut st = sess_arc.lock().await;
            st.mode = "none".to_string();
            st.ws_send_tx = None;
        }
        let _ = app_clone.emit("session:disconnected", ());
    });

    Ok(session_name_ret)
}

#[tauri::command]
pub async fn leave_session() -> Result<(), String> {
    let mut st = sess().lock().await;
    st.ws_send_tx = None;
    st.mode = "none".to_string();
    st.session_name = String::new();
    st.peers.clear();
    Ok(())
}

// ─── Discovery ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn scan_for_sessions() -> Result<Vec<DiscoveredSession>, String> {
    use tokio::time::{timeout, Duration, Instant};
    use std::collections::HashSet;

    // Try to bind to the discovery port
    let socket = match tokio::net::UdpSocket::bind(format!("0.0.0.0:{}", DISCOVERY_PORT)).await {
        Ok(s) => s,
        Err(_) => {
            // Port already in use (we're hosting) — just return empty list
            return Ok(vec![]);
        }
    };

    let mut found = Vec::<DiscoveredSession>::new();
    let mut seen = HashSet::<String>::new();
    let mut buf = vec![0u8; 1024];
    let deadline = Instant::now() + Duration::from_millis(3000);

    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        match timeout(remaining, socket.recv_from(&mut buf)).await {
            Ok(Ok((len, addr))) => {
                if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&buf[..len]) {
                    if val["type"] == "announce" {
                        let ip = val["ip"]
                            .as_str()
                            .unwrap_or(&addr.ip().to_string())
                            .to_string();
                        if !seen.contains(&ip) {
                            seen.insert(ip.clone());
                            found.push(DiscoveredSession {
                                name: val["name"].as_str().unwrap_or("Unknown Session").to_string(),
                                ip,
                                port: val["port"].as_u64().unwrap_or(WS_PORT as u64) as u16,
                            });
                        }
                    }
                }
            }
            _ => break,
        }
    }
    Ok(found)
}

#[tauri::command]
pub async fn get_session_info() -> Result<SessionInfo, String> {
    let st = sess().lock().await;
    Ok(SessionInfo {
        mode: st.mode.clone(),
        session_name: st.session_name.clone(),
        pin: st.pin.clone(),
        host_ip: st.host_ip.clone(),
        local_ip: st.local_ip.clone(),
        peers: st.peers.values().cloned().collect(),
    })
}

// ── Small helpers ─────────────────────────────────────────────────────────────

fn chrono_now() -> String {
    use std::time::SystemTime;
    let secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{}", secs)
}
