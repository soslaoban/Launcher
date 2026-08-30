use base64::{engine::general_purpose::STANDARD, Engine as _};
use lnk::{encoding::WINDOWS_1252, ShellLink};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs;
use std::io::Cursor;
use std::mem::size_of;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use tauri::{Manager, WindowEvent};

const CURRENT_SCHEMA_VERSION: u64 = 3;
const STATE_FILE: &str = "launcher-state.json";
const WINDOW_SIZE_FILE: &str = "launcher-window.json";
static STATE_WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn is_executable_file(path: &Path) -> bool {
  path.is_file() && path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
}

fn normalize_command_path(value: &str) -> String {
  let mut normalized = value.trim();
  loop {
    let wrapped_in_quotes = normalized.len() >= 2
      && ((normalized.starts_with('"') && normalized.ends_with('"'))
        || (normalized.starts_with('\'') && normalized.ends_with('\'')));
    if !wrapped_in_quotes { break; }
    normalized = normalized[1..normalized.len() - 1].trim();
  }
  normalized.to_string()
}

fn normalize_executable_path(value: &str) -> String {
  let normalized = normalize_command_path(value);
  if normalized.len() > 3 {
    normalized.trim_end_matches(['\\', '/']).to_string()
  } else {
    normalized
  }
}

fn resolve_working_directory(executable: &Path, requested: Option<&str>) -> Option<PathBuf> {
  if let Some(value) = requested.map(normalize_command_path).filter(|value| !value.is_empty()) {
    let directory = PathBuf::from(value);
    if directory.is_dir() { return Some(directory); }
  }
  executable.parent().filter(|directory| directory.is_dir()).map(Path::to_path_buf)
}

fn initial_state() -> Value {
  json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "apps": [], "categories": [], "preferences": {}, "isNew": true })
}

fn migrate_launcher_state(mut state: Value) -> Result<Value, String> {
  let object = state.as_object_mut().ok_or("应用数据必须是 JSON 对象")?;
  let mut version = object.get("schemaVersion").and_then(Value::as_u64).unwrap_or(1);
  if version > CURRENT_SCHEMA_VERSION { return Err(format!("数据版本 {version} 高于当前应用支持的版本")); }
  if version < 2 {
    object.entry("apps").or_insert_with(|| Value::Array(vec![]));
    object.entry("categories").or_insert_with(|| Value::Array(vec![]));
    version = 2;
  }
  if version < 3 {
    let mut preferences = Map::new();
    for key in ["theme", "background", "brandName", "brandIcon"] {
      if let Some(value) = object.remove(key) { preferences.insert(key.to_string(), value); }
    }
    object.entry("preferences").or_insert_with(|| Value::Object(preferences));
  }
  if !object.get("apps").is_some_and(Value::is_array) || !object.get("categories").is_some_and(Value::is_array) {
    return Err("应用数据中的 apps 或 categories 格式无效".into());
  }
  object.entry("preferences").or_insert_with(|| Value::Object(Map::new()));
  object.insert("schemaVersion".into(), Value::from(CURRENT_SCHEMA_VERSION));
  Ok(state)
}

fn launcher_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  app.path().app_data_dir().map(|directory| directory.join(STATE_FILE)).map_err(|error| error.to_string())
}

fn window_size_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  app.path().app_data_dir().map(|directory| directory.join(WINDOW_SIZE_FILE)).map_err(|error| error.to_string())
}

fn write_state_atomically(path: &Path, state: &Value) -> Result<(), String> {
  let _guard = STATE_WRITE_LOCK.get_or_init(|| Mutex::new(())).lock().map_err(|_| "状态写入锁已损坏".to_string())?;
  let parent = path.parent().ok_or("无法确定应用数据目录")?;
  fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  let temporary = path.with_extension(format!("json.{}.tmp", std::process::id()));
  fs::write(&temporary, serde_json::to_vec_pretty(state).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;

  // Windows cannot rename a file over an existing destination. Remove the
  // previous snapshot first so repeated saves replace it successfully.
  #[cfg(target_os = "windows")]
  if path.exists() {
    fs::remove_file(path).map_err(|error| {
      let _ = fs::remove_file(&temporary);
      error.to_string()
    })?;
  }

  fs::rename(&temporary, path).map_err(|error| { let _ = fs::remove_file(&temporary); error.to_string() })
}

#[tauri::command]
fn load_launcher_state(app: tauri::AppHandle) -> Result<Value, String> {
  let path = launcher_state_path(&app)?;
  if !path.exists() { return Ok(initial_state()); }
  fs::read_to_string(path).map_err(|error| error.to_string()).and_then(|state| serde_json::from_str::<Value>(&state).map_err(|error| format!("应用数据文件无法解析: {error}"))).and_then(migrate_launcher_state)
}

#[tauri::command]
fn save_launcher_state(app: tauri::AppHandle, state: Value) -> Result<(), String> {
  let migrated = migrate_launcher_state(state)?;
  write_state_atomically(&launcher_state_path(&app)?, &migrated)
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowSize { width: u32, height: u32 }

#[tauri::command]
fn load_window_size(app: tauri::AppHandle) -> Result<Option<WindowSize>, String> {
  let path = window_size_path(&app)?;
  if !path.exists() { return Ok(None); }
  let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
  let size = serde_json::from_str::<WindowSize>(&contents).map_err(|error| format!("窗口尺寸文件无法解析: {error}"))?;
  if size.width < 480 || size.height < 360 { return Ok(None); }
  Ok(Some(size))
}

#[tauri::command]
fn save_window_size(app: tauri::AppHandle, width: u32, height: u32) -> Result<(), String> {
  if width < 480 || height < 360 || width > 16384 || height > 16384 { return Ok(()); }
  let value = serde_json::to_value(WindowSize { width, height }).map_err(|error| error.to_string())?;
  write_state_atomically(&window_size_path(&app)?, &value)
}

#[tauri::command]
fn path_exists(path: String) -> bool { is_executable_file(Path::new(&normalize_executable_path(&path))) }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutDetails { target_path: String, arguments: String, working_directory: String, icon_location: String }

fn shortcut_target(shortcut: &ShellLink, shortcut_path: &Path) -> Option<PathBuf> {
  if let Some(link_info) = shortcut.link_info().as_ref() {
    if let Some(base) = link_info.local_base_path() { return Some(PathBuf::from(base).join(link_info.common_path_suffix())); }
  }
  let strings = shortcut.string_data();
  let relative = strings.relative_path().as_ref()?;
  let base = strings.working_dir().as_ref().map(PathBuf::from).or_else(|| shortcut_path.parent().map(PathBuf::from))?;
  Some(base.join(relative))
}

fn read_shortcut(path: &Path) -> Result<ShortcutDetails, String> {
  if !path.is_file() || !path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("lnk")) { return Err("目标文件不存在或不是 .lnk 快捷方式".into()); }
  let shortcut = ShellLink::open(path, WINDOWS_1252).map_err(|error| format!("无法解析快捷方式: {error}"))?;
  let target_path = shortcut_target(&shortcut, path).ok_or("快捷方式没有可读取的目标路径")?;
  let strings = shortcut.string_data();
  Ok(ShortcutDetails {
    target_path: target_path.to_string_lossy().into_owned(),
    arguments: strings.command_line_arguments().clone().unwrap_or_default(),
    working_directory: strings.working_dir().clone().unwrap_or_else(|| target_path.parent().unwrap_or(Path::new("")).to_string_lossy().into_owned()),
    icon_location: strings.icon_location().clone().unwrap_or_else(|| target_path.to_string_lossy().into_owned()),
  })
}

#[tauri::command]
fn resolve_shortcut(path: String) -> Result<ShortcutDetails, String> { read_shortcut(Path::new(&path)) }

#[cfg(target_os = "windows")]
fn executable_icon_data_url(path: &Path) -> Result<String, String> {
  use image::{imageops::{crop_imm, overlay, resize, FilterType}, DynamicImage, ImageFormat, RgbaImage};
  use windows::core::PCWSTR;
  use windows::Win32::UI::Controls::{IImageList, ILD_NORMAL};
  use windows::Win32::Graphics::Gdi::{CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ};
  use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
  use windows::Win32::UI::Shell::{SHGetFileInfoW, SHGetImageList, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_SYSICONINDEX, SHIL_JUMBO};
  use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL};
  const SIZE: i32 = 256;
  let wide_path: Vec<u16> = path.as_os_str().to_string_lossy().encode_utf16().chain(Some(0)).collect();
  let mut file_info = SHFILEINFOW::default();
  let received = unsafe { SHGetFileInfoW(PCWSTR(wide_path.as_ptr()), FILE_FLAGS_AND_ATTRIBUTES(0), Some(&mut file_info), size_of::<SHFILEINFOW>() as u32, SHGFI_SYSICONINDEX) };
  if received == 0 { return Err("Windows 未返回可执行文件图标".into()); }
  let icon = unsafe { SHGetImageList::<IImageList>(SHIL_JUMBO as i32).ok().and_then(|image_list| image_list.GetIcon(file_info.iIcon, ILD_NORMAL.0).ok()) }.filter(|icon| !icon.is_invalid()).or_else(|| {
    let received = unsafe { SHGetFileInfoW(PCWSTR(wide_path.as_ptr()), FILE_FLAGS_AND_ATTRIBUTES(0), Some(&mut file_info), size_of::<SHFILEINFOW>() as u32, SHGFI_ICON | SHGFI_LARGEICON) };
    (received != 0 && !file_info.hIcon.is_invalid()).then_some(file_info.hIcon)
  }).ok_or("Windows 未返回可执行文件图标")?;
  let mut bitmap_info = BITMAPINFO::default();
  bitmap_info.bmiHeader = BITMAPINFOHEADER { biSize: size_of::<BITMAPINFOHEADER>() as u32, biWidth: SIZE, biHeight: -SIZE, biPlanes: 1, biBitCount: 32, biCompression: BI_RGB.0, ..Default::default() };
  let mut bits = std::ptr::null_mut();
  let bitmap = unsafe { CreateDIBSection(None, &bitmap_info, DIB_RGB_COLORS, &mut bits, None, 0) }.map_err(|error| error.to_string())?;
  let dc = unsafe { CreateCompatibleDC(None) };
  if dc.is_invalid() || bitmap.is_invalid() || bits.is_null() { unsafe { let _ = DestroyIcon(icon); } return Err("无法创建图标绘制缓冲区".into()); }
  unsafe {
    let previous_bitmap = SelectObject(dc, HGDIOBJ::from(bitmap));
    let result = (|| -> Result<String, String> {
      DrawIconEx(dc, 0, 0, icon, SIZE, SIZE, 0, None, DI_NORMAL).map_err(|error| error.to_string())?;
      let bgra = std::slice::from_raw_parts(bits as *const u8, (SIZE * SIZE * 4) as usize);
      let rgba = bgra.chunks_exact(4).flat_map(|pixel| [pixel[2], pixel[1], pixel[0], pixel[3]]).collect::<Vec<_>>();
      let image = RgbaImage::from_raw(SIZE as u32, SIZE as u32, rgba).ok_or("无法转换 Windows 图标像素")?;
      let bounds = image.enumerate_pixels().filter(|(_, _, pixel)| pixel[3] > 8).fold(None::<(u32, u32, u32, u32)>, |bounds, (x, y, _)| {
        Some(match bounds {
          Some((min_x, min_y, max_x, max_y)) => (min_x.min(x), min_y.min(y), max_x.max(x), max_y.max(y)),
          None => (x, y, x, y),
        })
      });
      let image = if let Some((min_x, min_y, max_x, max_y)) = bounds {
        let width = max_x - min_x + 1;
        let height = max_y - min_y + 1;
        let cropped = crop_imm(&image, min_x, min_y, width, height).to_image();
        let available = (SIZE - 8) as u32;
        let scale = (available as f32 / width as f32).min(available as f32 / height as f32);
        let target_width = ((width as f32 * scale).round() as u32).max(1);
        let target_height = ((height as f32 * scale).round() as u32).max(1);
        let resized = resize(&cropped, target_width, target_height, FilterType::Lanczos3);
        let mut normalized = RgbaImage::new(SIZE as u32, SIZE as u32);
        overlay(&mut normalized, &resized, ((SIZE as u32 - target_width) / 2) as i64, ((SIZE as u32 - target_height) / 2) as i64);
        normalized
      } else { image };
      let mut output = Cursor::new(Vec::new());
      DynamicImage::ImageRgba8(image).write_to(&mut output, ImageFormat::Png).map_err(|error| error.to_string())?;
      Ok(format!("data:image/png;base64,{}", STANDARD.encode(output.into_inner())))
    })();
    SelectObject(dc, previous_bitmap);
    let _ = DeleteObject(HGDIOBJ::from(bitmap)); let _ = DeleteDC(dc); let _ = DestroyIcon(icon);
    result
  }
}

#[cfg(not(target_os = "windows"))]
fn executable_icon_data_url(_path: &Path) -> Result<String, String> { Err("当前平台不支持读取 Windows 可执行文件图标".into()) }

#[tauri::command]
fn read_application_icon(path: String) -> Result<String, String> {
  let path = Path::new(&path);
  if !is_executable_file(path) { return Err("目标文件不存在或不是 .exe".into()); }
  executable_icon_data_url(path)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveredApplication {
  name: String,
  executable_path: String,
  arguments: String,
  working_directory: String,
  icon_path: Option<String>,
}

fn collect_application_files(directory: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
  for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
    let entry = entry.map_err(|error| error.to_string())?;
    let path = entry.path();
    let file_type = entry.file_type().map_err(|error| error.to_string())?;
    if file_type.is_dir() {
      collect_application_files(&path, files)?;
    } else if file_type.is_file() && path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("exe") || extension.eq_ignore_ascii_case("lnk")) {
      files.push(path);
    }
  }
  Ok(())
}

#[tauri::command]
fn discover_applications(path: String) -> Result<Vec<DiscoveredApplication>, String> {
  let directory = Path::new(&path);
  if !directory.is_dir() { return Err(format!("目录不存在: {path}")); }
  let mut files = Vec::new();
  collect_application_files(directory, &mut files)?;
  let mut applications = files.into_iter().filter_map(|file| {
    let is_shortcut = file.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("lnk"));
    let (executable, arguments, working_directory) = if is_shortcut {
      let shortcut = read_shortcut(&file).ok()?;
      (PathBuf::from(shortcut.target_path), shortcut.arguments, shortcut.working_directory)
    } else {
      (file.clone(), String::new(), file.parent()?.to_string_lossy().into_owned())
    };
    if !is_executable_file(&executable) { return None; }
    let name = file.file_stem()?.to_string_lossy().into_owned();
    let icon_path = executable_icon_data_url(&executable).ok();
    Some(DiscoveredApplication { name, executable_path: executable.to_string_lossy().into_owned(), arguments, working_directory, icon_path })
  }).collect::<Vec<_>>();
  applications.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
  Ok(applications)
}

#[tauri::command]
fn launch_app(executable_path: String, arguments: Vec<String>, working_directory: Option<String>) -> Result<(), String> {
  let normalized_executable_path = normalize_executable_path(&executable_path);
  let executable = Path::new(&normalized_executable_path);
  if !is_executable_file(executable) { return Err(format!("目标文件不存在或不是 .exe: {normalized_executable_path}")); }
  let mut command = Command::new(executable);
  command.args(arguments);
  let requested_working_directory = working_directory.as_deref();
  let resolved_working_directory = resolve_working_directory(executable, requested_working_directory);
  if let Some(directory) = resolved_working_directory.as_deref() { command.current_dir(directory); }
  command.spawn().map(|_| ()).map_err(|error| {
    let directory = resolved_working_directory.as_deref().map(|path| path.to_string_lossy()).unwrap_or_else(|| "未设置".into());
    format!("无法启动程序 `{normalized_executable_path}`（工作目录：{directory}）：{error}")
  })
}

#[tauri::command]
fn open_directory(path: String) -> Result<(), String> {
  let directory = Path::new(&path);
  if !directory.is_dir() { return Err(format!("目录不存在: {path}")); }
  #[cfg(target_os = "windows")] { return Command::new("explorer").arg(directory).spawn().map(|_| ()).map_err(|error| error.to_string()); }
  #[cfg(target_os = "macos")] { return Command::new("open").arg(directory).spawn().map(|_| ()).map_err(|error| error.to_string()); }
  #[cfg(all(unix, not(target_os = "macos")))] { return Command::new("xdg-open").arg(directory).spawn().map(|_| ()).map_err(|error| error.to_string()); }
  #[allow(unreachable_code)] Err("当前平台不支持打开目录".into())
}

#[tauri::command]
fn open_log_directory() -> Result<(), String> {
  let directory = std::env::var("LOCALAPPDATA").map(|base| Path::new(&base).join("Launcher").join("logs")).map_err(|error| error.to_string())?;
  fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
  open_directory(directory.to_string_lossy().into_owned())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
  use tauri_plugin_autostart::ManagerExt;
  let manager = app.autolaunch();
  if enabled { manager.enable() } else { manager.disable() }.map_err(|error| error.to_string())?;
  manager.is_enabled().map_err(|error| error.to_string())
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
  use tauri_plugin_autostart::ManagerExt;
  app.autolaunch().is_enabled().map_err(|error| error.to_string())
}

fn show_main_window(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus(); }
}

#[tauri::command]
fn frontend_ready(app: tauri::AppHandle) { show_main_window(&app); }

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn replaces_existing_state_file() {
    let directory = std::env::temp_dir().join(format!("launcher-state-test-{}", std::process::id()));
    let path = directory.join("state.json");
    let _ = fs::remove_dir_all(&directory);

    write_state_atomically(&path, &json!({ "value": 1 })).expect("initial state should be written");
    write_state_atomically(&path, &json!({ "value": 2 })).expect("existing state should be replaced");

    let contents = fs::read_to_string(&path).expect("state should be readable");
    assert_eq!(serde_json::from_str::<Value>(&contents).expect("state should be valid JSON")["value"], 2);
    let _ = fs::remove_dir_all(&directory);
  }

  #[test]
  fn migrates_v1_state_to_current_schema() {
    let migrated = migrate_launcher_state(json!({ "apps": [], "categories": [], "theme": "dark" })).expect("migration should succeed");
    assert_eq!(migrated["schemaVersion"], CURRENT_SCHEMA_VERSION); assert_eq!(migrated["preferences"]["theme"], "dark");
  }
  #[test]
  fn rejects_future_state_schema() { assert!(migrate_launcher_state(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION + 1, "apps": [], "categories": [] })).is_err()); }
  #[test]
  fn rejects_missing_executable() { assert!(launch_app("C:\\this-path-does-not-exist\\missing.exe".into(), vec![], None).is_err()); }
  #[test]
  fn rejects_non_executable_file() {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
    assert!(!path_exists(manifest.to_string_lossy().into_owned())); assert!(launch_app(manifest.to_string_lossy().into_owned(), vec![], None).is_err());
  }
  #[test]
  fn normalizes_wrapped_command_paths() {
    assert_eq!(normalize_command_path(r#"  'C:\\Apps\\Launcher.exe'  "#), r#"C:\\Apps\\Launcher.exe"#);
    assert_eq!(normalize_executable_path(r#"C:\\Apps\\Launcher.exe\\"#), r#"C:\\Apps\\Launcher.exe"#);
  }
  #[cfg(target_os = "windows")]
  #[test]
  fn launches_existing_windows_command() {
    let executable = Path::new(&std::env::var("SystemRoot").expect("SystemRoot must be available")).join("System32").join("cmd.exe");
    let executable_with_trailing_separator = format!("{}\\", executable.display());
    launch_app(executable_with_trailing_separator, vec!["/C".into(), "exit 0".into()], None).expect("cmd.exe should launch successfully");
  }
  #[cfg(target_os = "windows")]
  #[test]
  fn launches_with_quoted_executable_and_missing_working_directory() {
    let executable = Path::new(&std::env::var("SystemRoot").expect("SystemRoot must be available")).join("System32").join("cmd.exe");
    let quoted_executable = format!("\"{}\"", executable.display());
    let missing_directory = Path::new(&std::env::temp_dir()).join("launcher-working-directory-that-does-not-exist");
    launch_app(quoted_executable, vec!["/C".into(), "exit 0".into()], Some(missing_directory.to_string_lossy().into_owned())).expect("cmd.exe should fall back to its parent directory");
  }
  #[cfg(target_os = "windows")]
  #[test]
  fn reads_windows_executable_icon() {
    let executable = Path::new(&std::env::var("SystemRoot").expect("SystemRoot must be available")).join("System32").join("cmd.exe");
    let data_url = executable_icon_data_url(&executable).expect("cmd.exe icon should be readable");
    assert!(data_url.starts_with("data:image/png;base64,"));
    let encoded = data_url.strip_prefix("data:image/png;base64,").expect("PNG data URL prefix should be present");
    let png = STANDARD.decode(encoded).expect("icon data URL should contain valid base64");
    let image = image::load_from_memory(&png).expect("icon data should contain a valid PNG");
    assert_eq!((image.width(), image.height()), (256, 256));
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_autostart::Builder::new().app_name("启动器").build())
    .invoke_handler(tauri::generate_handler![frontend_ready, load_launcher_state, save_launcher_state, load_window_size, save_window_size, path_exists, resolve_shortcut, read_application_icon, discover_applications, launch_app, open_directory, open_log_directory, set_autostart, get_autostart])
    .setup(|app| {
      if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(size)) = load_window_size(app.handle().clone()) {
          let _ = window.set_size(tauri::PhysicalSize::new(size.width, size.height));
        }
      }
      if cfg!(debug_assertions) { app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?; }
      #[cfg(desktop)] {
        use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder};
        use tauri_plugin_global_shortcut::ShortcutState;
        let show = MenuItem::with_id(app, "show", "显示启动器", true, None::<&str>)?;
        let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show, &quit])?;
        let icon = app.default_window_icon().cloned().ok_or("应用图标不可用")?;
        TrayIconBuilder::with_id("launcher-tray").menu(&menu).icon(icon).tooltip("启动器").on_menu_event(|app, event| match event.id().as_ref() { "show" => show_main_window(app), "quit" => app.exit(0), _ => {} }).build(app)?;
        app.handle().plugin(tauri_plugin_global_shortcut::Builder::new().with_shortcuts(["ctrl+alt+space"])? .with_handler(|app, _shortcut, event| { if event.state == ShortcutState::Pressed { show_main_window(app); } }).build())?;
      }
      Ok(())
    })
    .on_window_event(|window, event| {
      match event {
        // The frontend owns resize persistence after startup state is ready;
        // Rust must not persist the initial 800x600 creation event.
        WindowEvent::CloseRequested { api, .. } => {
          if let Ok(size) = window.inner_size() {
            let _ = save_window_size(window.app_handle().clone(), size.width, size.height);
          }
          let _ = window.hide();
          api.prevent_close();
        }
        _ => {}
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
