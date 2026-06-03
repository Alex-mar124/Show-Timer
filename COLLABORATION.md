# Show Timer — Collaboration / Multi-Device Sync

> Design document for the real-time multi-device session system.
> Last updated: 2026-06-03

---

## 1. The Problem

A theatre production involves many people who all need to know what's happening right now:
- **Stage Manager** (primary) — running the timer, calling cues
- **FOH Manager / House Manager** — needs to know doors, interval, show end
- **Lighting / Sound Ops** — need to know act start times, intervals
- **Production Manager** — monitoring overall show timing
- **Deputy Stage Manager** — backup, can take over if SM's device fails

All of these people are on the same restricted local network (venue WiFi, production hotspot, or hardwired switch). **No internet access is assumed.**

---

## 2. Constraints

| Constraint | Detail |
|---|---|
| **No internet** | Must work entirely on LAN — venue WiFi, TP-Link hotspot, Ethernet switch |
| **Restricted firewall** | Standard ports (80, 443) may be blocked. Use a non-standard port (4242) |
| **Mixed devices** | Windows 10/11, macOS Intel, macOS Apple Silicon — all equal participants |
| **Latency** | LAN latency ~1ms; sync should feel instant |
| **Reliability** | If the host device drops, the session should degrade gracefully |
| **Simplicity** | Stage managers under pressure — joining should take <30 seconds |

---

## 3. Architecture

### 3.1 Topology

```
HOST DEVICE (Stage Manager's PC/Mac)
  ├── Runs WebSocket Server  (TCP port 4242)
  ├── Runs UDP Discovery Broadcaster  (UDP broadcast → port 4243)
  └── All changes broadcast to all connected clients instantly

CLIENT DEVICES (any number — FOH, LX, SM backup, etc.)
  ├── Auto-discover host via UDP or enter IP manually
  ├── Connect via WebSocket + PIN auth
  └── Receive full state sync + live updates
  └── CAN control (send actions back to host) — or view-only (configurable)
```

### 3.2 Communication Layers

**Layer 1 — Discovery (UDP)**
- Host broadcasts `ANNOUNCE` packet every 2 seconds on `255.255.255.255:4243`
- Clients scan for 3 seconds and present a list of found sessions
- Fallback: manual IP + port entry

**Layer 2 — Session (WebSocket TCP)**
- Persistent bi-directional connection on port 4242
- All state changes flow through this connection
- Automatic reconnection on disconnect

**Layer 3 — Authentication (PIN)**
- 6-digit PIN generated on session create
- PIN must be entered on joining devices
- Prevents accidental joins on shared networks

### 3.3 Data Flow

```
HOST makes change
  └─→ Local Zustand store updates
  └─→ Rust command: session_broadcast_state(showJson)
  └─→ Rust WS server broadcasts to all connected CLIENT WebSockets

CLIENT makes change (control enabled)
  └─→ Local Zustand store updates (optimistic)
  └─→ Rust WS client sends show state to HOST
  └─→ HOST Rust receives → emits Tauri event 'session:state_received'
  └─→ HOST's React applies state update
  └─→ HOST Rust also rebroadcasts to all other CLIENTS

NEW CLIENT connects
  └─→ Authenticates with PIN
  └─→ HOST sends full current show state immediately
  └─→ CLIENT Rust emits 'session:state_received' to CLIENT React
  └─→ CLIENT React is now fully synced
```

### 3.4 Loop Prevention

Each state broadcast includes a `_syncId` (UUID). React tracks the last ID it *sent*. When it receives a state, it skips if the `_syncId` matches its last sent ID (own echo). All other incoming states are applied without re-broadcasting.

---

## 4. Features

### 4.1 Session Hosting
- [x] Generate 6-digit PIN automatically
- [x] Display IP address + PIN prominently for sharing
- [x] Show connected peer list (name, device type, join time)
- [x] Control permission toggle: "Allow all peers to control" (default ON)
- [x] Kick peer from session
- [x] Stop session (all clients see a disconnect banner)

### 4.2 Session Joining
- [x] Auto-scan for sessions on LAN (UDP, 3-second scan)
- [x] Manual IP entry fallback
- [x] PIN entry
- [x] Reconnect automatically on temporary drop
- [x] Leave session (returns to standalone mode)
- [x] View-only mode when host disables control

### 4.3 Sync Scope
**Synced in real time:**
- Active show (segments, times, notes, tech notes)
- All timer events (start, stop, hold, advance, mark end)
- Segment additions, deletions, reorders
- Expected durations
- Show notes + tech notes

**NOT synced (per-device):**
- App settings (time format, notification preferences)
- Show history (each device keeps its own)
- The running clock (each device uses its own system clock)

### 4.4 Conflict Resolution
- **Last write wins** — whichever state update reaches the host last is broadcast to all
- For theatre use, simultaneous edits are rare; this is acceptable
- Each update has a timestamp; if a received update is >5 seconds older than local, it is silently ignored

### 4.5 Failure Modes
| Failure | Behaviour |
|---|---|
| Host disconnects from network | Clients see "Session Lost" banner; continue as standalone |
| Client disconnects from network | Client sees reconnecting spinner; host shows peer as offline |
| Host closes app | Same as host disconnect |
| Two devices have different times | Timer displays still work correctly (all times are stored as ISO strings, displayed using local clock) |
| Network latency spike | Updates queue and flush when latency recovers |

---

## 5. UI Design

### 5.1 Header — Sync Status Chip
```
┌─ header ──────────────────────────────────────────────────────┐
│  ⏱ SHOW TIMER   [Show Name]   [T][H][⚙]   [⬡ 3 peers]  [+]  │
└───────────────────────────────────────────────────────────────┘
```
The `⬡` icon is the session button. Colour states:
- **Grey** — no session
- **Amber pulsing** — connecting / scanning
- **Green solid** — hosting or joined, connected
- **Red** — disconnected / error

Click → opens Session Panel (slide-in from right).

### 5.2 Session Panel States

**No Session:**
```
SYNC
────────────────────────────────────
Your network IP:  192.168.1.5

[ HOST SESSION ]
  Start a session others can join
  on this network.

[ JOIN SESSION ]
  Scanning... (spinner)
  ● Hamilton (192.168.1.3)   [Join]
  ● Phantom  (192.168.1.7)   [Join]
  ─────────────────────────
  Enter IP manually:  [___________]  [Connect]
```

**Hosting:**
```
● HOSTING
────────────────────────────────────
Hamilton · Tuesday Evening

PIN:   4  8  2  7
IP:    192.168.1.5 : 4242

Peers connected (2):
  ⬡ FOH Manager     MacBook  ●●●
  ⬡ LX Operator     Windows  ●●●

Control:  [Allow all ●]

                       [Stop Session]
```

**Joined:**
```
● JOINED
────────────────────────────────────
Hamilton · Tuesday Evening
Host: 192.168.1.5

Peers (3):
  ⬡ Stage Manager   Windows  (host)
  ⬡ FOH Manager     MacBook  ●●●
  ⬡ You             Mac      ●●●

You can:  [View only] or [Control ●]

                       [Leave Session]
```

### 5.3 Connected Peer Indicator (on main timer)
Small coloured dots at top right of active segment panel showing how many peers are watching.

---

## 6. Technical Stack Additions

### 6.1 Rust (src-tauri/Cargo.toml)
```toml
tokio-tungstenite = "0.24"       # WebSocket server + client
futures-util = "0.3"             # Stream/Sink extensions
local-ip-address = "0.6"         # Get LAN IP without netmask math
uuid = { version = "1", features = ["v4"] }  # Peer IDs
```

### 6.2 Rust Commands (src-tauri/src/session.rs)
```rust
get_local_ip()              → String
start_hosting(name, pin, device_name) → Result<String>  // returns local IP
stop_hosting()              → Result<()>
join_session(ip, port, pin, name, device_type) → Result<()>
leave_session()             → Result<()>
session_broadcast_state(state_json) → Result<()>
scan_for_sessions()         → Result<Vec<DiscoveredSession>>
get_session_info()          → Result<SessionInfo>
```

### 6.3 Tauri Events (Rust → React)
```
session:state_received   { show_json: string }
session:peer_joined      { peer: Peer }
session:peer_left        { peer_id: string }
session:disconnected     {}
session:session_found    { session: DiscoveredSession }
```

### 6.4 WebSocket Message Protocol
```json
// Client → Host auth
{ "type": "auth", "pin": "482791", "name": "FOH Manager", "device": "mac" }

// Host → Client auth response
{ "type": "auth_ok", "session_name": "Hamilton", "peer_id": "uuid" }
{ "type": "auth_fail", "reason": "Wrong PIN" }

// Bidirectional state sync
{ "type": "state", "show_json": "...", "_sync_id": "uuid", "_ts": 1234567890 }

// Server → all clients: peer list changes
{ "type": "peer_joined", "peer": { "id": "...", "name": "...", "device": "..." } }
{ "type": "peer_left",   "id": "..." }
```

---

## 7. Port / Firewall Notes

| Port | Protocol | Use |
|---|---|---|
| 4242 | TCP | WebSocket session server |
| 4243 | UDP | LAN discovery broadcast |

For **Windows**: On first run, Windows Firewall will prompt to allow the app. User accepts. No manual configuration needed.  
For **macOS**: macOS will prompt "Show Timer wants to accept incoming network connections." Accept once.  
For **restricted venue networks**: If broadcast is blocked, use manual IP entry. Port 4242 is in the private range and should not be blocked on production networks.

---

## 8. Security

| Threat | Mitigation |
|---|---|
| Unwanted access | 6-digit PIN required to join |
| PIN brute force | Max 3 failed attempts → 30s lockout |
| Accidental cross-show join | Session name displayed before PIN entry |
| Malicious state injection | State is JSON-validated before applying |
| Port scanning | App only accepts connections while session is active |

---

## 9. Build Phases

### Phase 1 (MVP)
- Host session with PIN + IP display
- Join via scan or manual IP
- Full state sync (start, stop, hold, advance)
- Peer list display
- Disconnect handling

### Phase 2
- Control permission toggle per peer
- Reconnect with automatic state resync
- QR code for IP+PIN sharing

### Phase 3
- Role-based permissions (view-only vs control)
- Session recording (audit log of all actions + who performed them)
- Cloud relay fallback (for teams not on the same network)
