use serde::Serialize;
use std::sync::OnceLock;

#[derive(Serialize, Clone, Default)]
pub struct DevFlags {
    pub dev: bool,
    pub seed: bool,
    pub scenario: Option<String>,
}

static FLAGS: OnceLock<DevFlags> = OnceLock::new();

/// Parse CLI flags once at startup:
///   --dev               enable dev mode
///   --seed              enable dev mode + seed sample data on first run
///   --scenario=<name>   enable dev mode + name a scenario for the frontend
pub fn parse_flags() {
    let mut f = DevFlags::default();
    for arg in std::env::args().skip(1) {
        if arg == "--dev" {
            f.dev = true;
        } else if arg == "--seed" {
            f.dev = true;
            f.seed = true;
        } else if let Some(name) = arg.strip_prefix("--scenario=") {
            f.dev = true;
            f.scenario = Some(name.to_string());
        }
    }
    let _ = FLAGS.set(f);
}

#[tauri::command]
pub fn dev_flags() -> DevFlags {
    FLAGS.get().cloned().unwrap_or_default()
}
