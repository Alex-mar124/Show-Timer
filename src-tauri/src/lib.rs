mod session;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_notification::init())
    .invoke_handler(tauri::generate_handler![
      session::get_local_ip,
      session::start_hosting,
      session::stop_hosting,
      session::session_broadcast_state,
      session::join_session,
      session::leave_session,
      session::scan_for_sessions,
      session::get_session_info,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
