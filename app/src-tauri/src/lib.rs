use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

const KEYRING_SERVICE: &str = "agent-interactive";

#[derive(Default)]
struct Loop {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
}

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

fn managed_path() -> PathBuf {
    home().join(".config/agent-interactive/managed.json")
}

fn defaults_path() -> PathBuf {
    home().join(".config/agent-interactive/defaults.json")
}

fn read_json(path: &Path) -> Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}))
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("settings.json"))
}

fn cli() -> Command {
    let cli = std::env::var("AGENT_INTERACTIVE_CLI")
        .ok()
        .or_else(|| option_env!("AGENT_INTERACTIVE_CLI_DEFAULT").map(String::from))
        .unwrap_or_else(|| "agent-interactive".into());
    Command::new(cli)
}

fn key_env(provider: &str) -> String {
    format!("{}_API_KEY", provider.to_uppercase().replace('-', "_"))
}

fn stored_keys() -> HashMap<String, String> {
    let managed = read_json(&managed_path());
    let mut providers: Vec<String> = vec!["cerebras".into(), "openrouter".into(), "openai".into(), "anthropic".into()];
    if let Some(model) = managed.get("flashModel").and_then(Value::as_str) {
        if let Some((p, _)) = model.split_once('/') {
            providers.push(p.to_string());
        }
    }
    let mut env = HashMap::new();
    for p in providers {
        if let Ok(k) = keyring::Entry::new(KEYRING_SERVICE, &p).and_then(|e| e.get_password()) {
            env.insert(key_env(&p), k);
        }
    }
    env
}

#[tauri::command]
fn settings_load(app: AppHandle) -> Result<Value, String> {
    Ok(json!({
        "settings": read_json(&settings_path(&app)?),
        "managed": read_json(&managed_path()),
        "defaults": read_json(&defaults_path()),
    }))
}

#[tauri::command]
fn settings_save(app: AppHandle, settings: Value) -> Result<(), String> {
    let path = settings_path(&app)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("{}: {e}", path.display()))
}

#[tauri::command]
async fn doctor(args: Vec<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let out = cli()
            .arg("doctor")
            .arg("--json")
            .args(&args)
            .envs(stored_keys())
            .stdin(Stdio::null())
            .output()
            .map_err(|e| format!("could not run agent-interactive: {e}"))?;
        let text = String::from_utf8_lossy(&out.stdout);
        serde_json::from_str::<Value>(text.trim()).map_err(|_| {
            let err = String::from_utf8_lossy(&out.stderr);
            let msg = if err.trim().is_empty() { text.trim().to_string() } else { err.trim().to_string() };
            format!("agent-interactive doctor: {msg}")
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn start_requested() -> bool {
    std::env::args().skip(1).any(|a| a == "--start")
}

#[tauri::command]
fn free_port() -> Result<u16, String> {
    for port in (5199u16..5299).step_by(2) {
        let a = std::net::TcpListener::bind(("127.0.0.1", port));
        let b = std::net::TcpListener::bind(("127.0.0.1", port + 1));
        if a.is_ok() && b.is_ok() {
            return Ok(port);
        }
    }
    Err("no free pair of ports between 5199 and 5299".into())
}

#[tauri::command]
fn loop_start(app: AppHandle, state: State<Loop>, args: Vec<String>) -> Result<(), String> {
    let mut slot = state.child.lock().unwrap();
    if let Some(child) = slot.as_mut() {
        if child.try_wait().map_err(|e| e.to_string())?.is_none() {
            return Err("a loop is already running".into());
        }
    }
    let mut child = cli()
        .args(&args)
        .envs(stored_keys())
        .env("AGENT_INTERACTIVE_PARENT", "app")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not start agent-interactive: {e}"))?;
    for stream in [
        child.stdout.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
        child.stderr.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>),
    ]
    .into_iter()
    .flatten()
    {
        let app = app.clone();
        thread::spawn(move || {
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                let _ = app.emit("loop-line", line);
            }
        });
    }
    *state.stdin.lock().unwrap() = child.stdin.take();
    let pid = child.id();
    *slot = Some(child);
    let app2 = app.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(300));
        let state = app2.state::<Loop>();
        let mut slot = state.child.lock().unwrap();
        let Some(child) = slot.as_mut() else { return };
        if child.id() != pid {
            return;
        }
        if let Ok(Some(status)) = child.try_wait() {
            *slot = None;
            let _ = app2.emit("loop-exit", status.code());
            return;
        }
    });
    Ok(())
}

fn stop(state: &Loop) {
    let Some(mut child) = state.child.lock().unwrap().take() else { return };
    *state.stdin.lock().unwrap() = None;
    let _ = Command::new("kill").args(["-INT", &child.id().to_string()]).status();
    let until = Instant::now() + Duration::from_secs(20);
    while Instant::now() < until {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
}

#[tauri::command]
async fn loop_stop(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Loop>();
        stop(&state);
        let _ = app.emit("loop-exit", Value::Null);
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn loop_input(state: State<Loop>, line: String) -> Result<(), String> {
    let mut stdin = state.stdin.lock().unwrap();
    let pipe = stdin.as_mut().ok_or("the loop is not running")?;
    writeln!(pipe, "{line}").map_err(|e| e.to_string())
}

#[tauri::command]
fn key_set(provider: String, key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &provider).map_err(|e| e.to_string())?;
    if key.trim().is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(key.trim()).map_err(|e| format!("the keychain refused it: {e}"))
}

#[tauri::command]
fn key_status(providers: Vec<String>) -> HashMap<String, bool> {
    providers
        .into_iter()
        .map(|p| {
            let has = keyring::Entry::new(KEYRING_SERVICE, &p).and_then(|e| e.get_password()).is_ok();
            (p, has)
        })
        .collect()
}

fn ghostty_themes_dir() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let bin = dir.join("ghostty");
        if let Ok(real) = std::fs::canonicalize(&bin) {
            let themes = real.parent()?.parent()?.join("share/ghostty/themes");
            if themes.is_dir() {
                return Some(themes);
            }
        }
    }
    let mac = PathBuf::from("/Applications/Ghostty.app/Contents/Resources/ghostty/themes");
    mac.is_dir().then_some(mac)
}

fn parse_ghostty(text: &str, into: &mut Map<String, Value>, palette: &mut Map<String, Value>) {
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('#') {
            continue;
        }
        let Some((k, v)) = line.split_once('=') else { continue };
        let (k, v) = (k.trim(), v.trim().trim_matches('"'));
        match k {
            "palette" => {
                if let Some((i, c)) = v.split_once('=') {
                    palette.insert(i.trim().to_string(), json!(c.trim()));
                }
            }
            "font-family" if !into.contains_key("fontFamily") => {
                into.insert("fontFamily".into(), json!(v));
            }
            "font-size" => {
                if let Ok(n) = v.parse::<f64>() {
                    into.insert("fontSize".into(), json!(n));
                }
            }
            "background" | "foreground" | "cursor-color" | "selection-background" | "selection-foreground" | "theme" => {
                into.insert(k.into(), json!(v));
            }
            _ => {}
        }
    }
}

#[tauri::command]
fn ghostty_look() -> Value {
    let mut look = Map::new();
    let mut palette = Map::new();
    let dir = home().join(".config/ghostty");
    for name in ["config", "config.ghostty"] {
        if let Ok(text) = std::fs::read_to_string(dir.join(name)) {
            parse_ghostty(&text, &mut look, &mut palette);
        }
    }
    if let Some(theme) = look.get("theme").and_then(Value::as_str).map(str::to_string) {
        let pick = theme.split(',').map(|t| t.trim().trim_start_matches("dark:").trim_start_matches("light:")).next().unwrap_or("").to_string();
        if let Some(text) = ghostty_themes_dir().and_then(|d| std::fs::read_to_string(d.join(&pick)).ok()) {
            let mut from_theme = Map::new();
            let mut theme_palette = Map::new();
            parse_ghostty(&text, &mut from_theme, &mut theme_palette);
            for (k, v) in from_theme {
                look.entry(k).or_insert(v);
            }
            for (k, v) in theme_palette {
                palette.entry(k).or_insert(v);
            }
        }
    }
    look.insert("palette".into(), Value::Object(palette));
    Value::Object(look)
}

#[cfg(target_os = "macos")]
fn adopt_login_path() {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    if let Ok(out) = Command::new(shell).args(["-l", "-c", "printenv PATH"]).output() {
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !path.is_empty() {
            std::env::set_var("PATH", path);
        }
    }
}

pub fn run() {
    #[cfg(target_os = "macos")]
    adopt_login_path();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Loop::default())
        .invoke_handler(tauri::generate_handler![
            settings_load,
            settings_save,
            doctor,
            start_requested,
            free_port,
            loop_start,
            loop_stop,
            loop_input,
            key_set,
            key_status,
            ghostty_look
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("agent-interactive-app: {e}");
            std::process::exit(1)
        });
    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            stop(&handle.state::<Loop>());
        }
    });
}
