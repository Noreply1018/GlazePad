use arboard::{Clipboard, ImageData};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
#[cfg(desktop)]
use std::process::Command;
use std::{
    borrow::Cow,
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
#[cfg(desktop)]
use tauri::{
    menu::{CheckMenuItem, MenuBuilder, MenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use uuid::Uuid;

#[cfg(desktop)]
type TrayCheckItem = CheckMenuItem<tauri::Wry>;
#[cfg(desktop)]
type TrayTextItem = MenuItem<tauri::Wry>;

type AppResult<T> = Result<T, String>;
const PAD_WINDOW_WIDTH: f64 = 422.0;
const PAD_WINDOW_HEIGHT: f64 = 372.0;
const WAKE_WINDOW_WIDTH: f64 = 42.0;
const WAKE_WINDOW_HEIGHT: f64 = 86.0;
const TRAY_SHOW: &str = "show";
const TRAY_HIDE: &str = "hide";
const TRAY_OPEN_DATA: &str = "open_data";
const TRAY_ABOUT: &str = "about";
const TRAY_QUIT: &str = "quit";
const TRAY_THEME_ICE: &str = "theme_ice";
const TRAY_THEME_SMOKE: &str = "theme_smoke";
const TRAY_THEME_MINT: &str = "theme_mint";
const TRAY_THEME_ROSE: &str = "theme_rose";
const TRAY_OPACITY_CLEAR: &str = "opacity_clear";
const TRAY_OPACITY_STANDARD: &str = "opacity_standard";
const TRAY_OPACITY_LIGHT: &str = "opacity_light";
const TRAY_OPACITY_ULTRA: &str = "opacity_ultra";
const TRAY_AUTOSTART: &str = "autostart";

#[cfg(desktop)]
#[derive(Clone)]
struct TrayMenuState {
    theme_ice: TrayCheckItem,
    theme_smoke: TrayCheckItem,
    theme_mint: TrayCheckItem,
    theme_rose: TrayCheckItem,
    opacity_clear: TrayCheckItem,
    opacity_standard: TrayCheckItem,
    opacity_light: TrayCheckItem,
    opacity_ultra: TrayCheckItem,
    autostart: TrayTextItem,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppState {
    active_id: String,
    hidden: bool,
    #[serde(default)]
    settings: AppSettings,
    slots: Vec<Slot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    theme: ThemeName,
    opacity: OpacityLevel,
    autostart: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: ThemeName::Ice,
            opacity: OpacityLevel::Standard,
            autostart: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ThemeName {
    Ice,
    Smoke,
    Mint,
    Rose,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum OpacityLevel {
    Clear,
    Standard,
    Light,
    Ultra,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum Slot {
    #[serde(rename = "text")]
    #[serde(rename_all = "camelCase")]
    Text {
        id: String,
        title: String,
        content: String,
    },
    #[serde(rename = "image")]
    #[serde(rename_all = "camelCase")]
    Image {
        id: String,
        title: String,
        #[serde(default)]
        content: String,
        #[serde(rename = "imagePath", alias = "image_path")]
        image_path: String,
        #[serde(rename = "imageType", alias = "image_type")]
        image_type: String,
        width: u32,
        height: u32,
    },
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ClipboardPayload {
    #[serde(rename = "text")]
    Text { content: String },
    #[serde(rename = "image")]
    Image {
        #[serde(rename = "imagePath")]
        image_path: String,
        #[serde(rename = "imageType")]
        image_type: String,
        width: u32,
        height: u32,
    },
    #[serde(rename = "empty")]
    Empty,
}

fn app_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("无法获取应用数据目录：{err}"))?;
    fs::create_dir_all(dir.join("images")).map_err(|err| format!("无法创建应用数据目录：{err}"))?;
    Ok(dir)
}

fn state_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app_dir(app)?.join("state.json"))
}

fn image_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app_dir(app)?.join("images"))
}

#[tauri::command]
fn load_state(app: AppHandle) -> AppResult<Option<AppState>> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(path).map_err(|err| format!("无法读取本地状态：{err}"))?;
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|err| format!("本地状态格式错误：{err}"))
}

#[tauri::command]
fn save_state(app: AppHandle, state: AppState) -> AppResult<()> {
    let path = state_path(&app)?;
    let raw =
        serde_json::to_string_pretty(&state).map_err(|err| format!("无法序列化本地状态：{err}"))?;
    fs::write(path, raw).map_err(|err| format!("无法写入本地状态：{err}"))?;
    let _ = cleanup_unreferenced_images(&app, &state);
    Ok(())
}

#[tauri::command]
fn read_clipboard(app: AppHandle) -> AppResult<ClipboardPayload> {
    let mut clipboard = Clipboard::new().map_err(|err| format!("无法访问系统剪贴板：{err}"))?;

    if let Ok(image) = clipboard.get_image() {
        let width = image.width as u32;
        let height = image.height as u32;
        let path = image_dir(&app)?.join(format!("{}.png", Uuid::new_v4()));
        let rgba = image::RgbaImage::from_raw(width, height, image.bytes.into_owned())
            .ok_or_else(|| "剪贴板图片格式无法解析".to_string())?;
        rgba.save_with_format(&path, image::ImageFormat::Png)
            .map_err(|err| format!("无法保存剪贴板图片：{err}"))?;

        return Ok(ClipboardPayload::Image {
            image_path: path.to_string_lossy().to_string(),
            image_type: "image/png".to_string(),
            width,
            height,
        });
    }

    if let Ok(text) = clipboard.get_text() {
        if !text.trim().is_empty() {
            return Ok(ClipboardPayload::Text { content: text });
        }
    }

    Ok(ClipboardPayload::Empty)
}

#[tauri::command]
fn write_slot_to_clipboard(slot: Slot) -> AppResult<()> {
    let mut clipboard = Clipboard::new().map_err(|err| format!("无法访问系统剪贴板：{err}"))?;

    match slot {
        Slot::Text { content, .. } => clipboard
            .set_text(content)
            .map_err(|err| format!("无法写入文本剪贴板：{err}")),
        Slot::Image { image_path, .. } => {
            let image = image::open(&image_path).map_err(|err| format!("无法读取图片：{err}"))?;
            let (width, height) = image.dimensions();
            let rgba = image.to_rgba8();
            clipboard
                .set_image(ImageData {
                    width: width as usize,
                    height: height as usize,
                    bytes: Cow::Owned(rgba.into_raw()),
                })
                .map_err(|err| format!("无法写入图片剪贴板：{err}"))
        }
    }
}

fn cleanup_unreferenced_images(app: &AppHandle, state: &AppState) -> AppResult<()> {
    let dir = image_dir(app)?;
    let keep: HashSet<PathBuf> = state
        .slots
        .iter()
        .filter_map(|slot| match slot {
            Slot::Image { image_path, .. } => Some(PathBuf::from(image_path)),
            Slot::Text { .. } => None,
        })
        .filter_map(|path| canonicalize_existing(&path))
        .collect();

    let entries = fs::read_dir(&dir).map_err(|err| format!("无法读取图片目录：{err}"))?;
    for entry in entries {
        let entry = entry.map_err(|err| format!("无法读取图片文件：{err}"))?;
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("png") {
            continue;
        }

        let Some(canonical) = canonicalize_existing(&path) else {
            continue;
        };

        if !keep.contains(&canonical) {
            let _ = fs::remove_file(&path);
        }
    }

    Ok(())
}

#[tauri::command]
fn cleanup_images(app: AppHandle, state: AppState) -> AppResult<()> {
    cleanup_unreferenced_images(&app, &state)
}

fn canonicalize_existing(path: &Path) -> Option<PathBuf> {
    path.canonicalize().ok()
}

#[tauri::command]
fn set_window_ready(window: WebviewWindow, hidden: bool) -> AppResult<()> {
    if hidden {
        place_wake_edge(&window)?;
    } else {
        place_window(&window)?;
    }
    window.show().map_err(|err| err.to_string())?;
    if hidden {
        Ok(())
    } else {
        window.set_focus().map_err(|err| err.to_string())
    }
}

#[tauri::command]
fn show_window(window: WebviewWindow) -> AppResult<()> {
    window.show().map_err(|err| err.to_string())?;
    window.set_focus().map_err(|err| err.to_string())?;
    place_window(&window)
}

#[tauri::command]
fn hide_window(window: WebviewWindow) -> AppResult<()> {
    place_wake_edge(&window)
}

fn place_window(window: &WebviewWindow) -> AppResult<()> {
    place_sized_window(
        window,
        LogicalSize::new(PAD_WINDOW_WIDTH, PAD_WINDOW_HEIGHT),
    )
}

fn place_wake_edge(window: &WebviewWindow) -> AppResult<()> {
    place_sized_window(
        window,
        LogicalSize::new(WAKE_WINDOW_WIDTH, WAKE_WINDOW_HEIGHT),
    )
}

fn place_sized_window(window: &WebviewWindow, size: LogicalSize<f64>) -> AppResult<()> {
    let _ = window.set_shadow(false);
    let monitor = window
        .current_monitor()
        .map_err(|err| err.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let monitor_pos = monitor.position().to_logical::<f64>(scale);
        let monitor_size = monitor.size().to_logical::<f64>(scale);
        let x = monitor_pos.x + monitor_size.width - size.width;
        let y = monitor_pos.y + ((monitor_size.height - size.height).max(0.0) / 2.0);
        window.set_size(size).map_err(|err| err.to_string())?;
        window
            .set_position(LogicalPosition::new(x, y))
            .map_err(|err| err.to_string())?;
    }

    window
        .set_always_on_top(true)
        .map_err(|err| err.to_string())
}

#[cfg(desktop)]
fn show_pad(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("glazepad-global-toggle", ());
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(desktop)]
fn hide_pad(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("glazepad-tray-hide", ());
        let _ = window.show();
    }
}

#[cfg(desktop)]
fn open_data_dir(app: &AppHandle) {
    let Ok(dir) = app_dir(app) else {
        return;
    };

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("explorer").arg(dir).spawn();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(dir).spawn();
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = Command::new("xdg-open").arg(dir).spawn();
    }
}

#[cfg(desktop)]
fn show_about(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let version = app.package_info().version.to_string();
        let _ = window.emit("glazepad-about", format!("GlazePad {version}"));
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(desktop)]
fn sync_tray_menu(app: &AppHandle, theme: &str, opacity: &str, autostart: bool) {
    let state = app.state::<TrayMenuState>();
    let _ = state.theme_ice.set_checked(theme == "ice");
    let _ = state.theme_smoke.set_checked(theme == "smoke");
    let _ = state.theme_mint.set_checked(theme == "mint");
    let _ = state.theme_rose.set_checked(theme == "rose");
    let _ = state.opacity_clear.set_checked(opacity == "clear");
    let _ = state.opacity_standard.set_checked(opacity == "standard");
    let _ = state.opacity_light.set_checked(opacity == "light");
    let _ = state.opacity_ultra.set_checked(opacity == "ultra");
    sync_tray_autostart(app, autostart);
}

#[cfg(desktop)]
fn sync_tray_autostart(app: &AppHandle, autostart: bool) {
    let state = app.state::<TrayMenuState>();
    let _ = state.autostart.set_text(if autostart {
        "开机自启动：已开启"
    } else {
        "开机自启动：未开启"
    });
}

#[tauri::command]
fn sync_tray_settings(app: AppHandle, theme: String, opacity: String, autostart: bool) {
    #[cfg(desktop)]
    sync_tray_menu(&app, &theme, &opacity, autostart);
}

#[cfg(desktop)]
fn toggle_autostart(app: &AppHandle) {
    let Ok(enabled) = app.autolaunch().is_enabled() else {
        return;
    };
    let next_enabled = !enabled;
    let result = if next_enabled {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    };

    if result.is_ok() {
        sync_tray_autostart(app, next_enabled);
        let _ = app.emit("glazepad-autostart-changed", next_enabled);
    } else {
        let _ = app.emit("glazepad-autostart-failed", "自启动设置失败");
    }
}

#[cfg(desktop)]
fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let theme_ice = CheckMenuItem::with_id(app, TRAY_THEME_ICE, "冰蓝", true, true, None::<&str>)?;
    let theme_smoke =
        CheckMenuItem::with_id(app, TRAY_THEME_SMOKE, "雾白", true, false, None::<&str>)?;
    let theme_mint =
        CheckMenuItem::with_id(app, TRAY_THEME_MINT, "薄荷", true, false, None::<&str>)?;
    let theme_rose =
        CheckMenuItem::with_id(app, TRAY_THEME_ROSE, "玫瑰", true, false, None::<&str>)?;
    let opacity_clear = CheckMenuItem::with_id(
        app,
        TRAY_OPACITY_CLEAR,
        "清晰（72%）",
        true,
        false,
        None::<&str>,
    )?;
    let opacity_standard = CheckMenuItem::with_id(
        app,
        TRAY_OPACITY_STANDARD,
        "标准（52%）",
        true,
        true,
        None::<&str>,
    )?;
    let opacity_light = CheckMenuItem::with_id(
        app,
        TRAY_OPACITY_LIGHT,
        "轻透（38%）",
        true,
        false,
        None::<&str>,
    )?;
    let opacity_ultra = CheckMenuItem::with_id(
        app,
        TRAY_OPACITY_ULTRA,
        "极透（26%）",
        true,
        false,
        None::<&str>,
    )?;
    let autostart = MenuItem::with_id(
        app,
        TRAY_AUTOSTART,
        "开机自启动：未开启",
        true,
        None::<&str>,
    )?;

    let theme_menu = SubmenuBuilder::new(app, "配色")
        .item(&theme_ice)
        .item(&theme_smoke)
        .item(&theme_mint)
        .item(&theme_rose)
        .build()?;

    let opacity_menu = SubmenuBuilder::new(app, "透明度")
        .item(&opacity_clear)
        .item(&opacity_standard)
        .item(&opacity_light)
        .item(&opacity_ultra)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&theme_menu)
        .item(&opacity_menu)
        .item(&autostart)
        .separator()
        .text(TRAY_OPEN_DATA, "打开数据目录")
        .text(TRAY_ABOUT, "关于 GlazePad")
        .separator()
        .text(TRAY_QUIT, "退出")
        .build()?;

    let mut tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("GlazePad")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_SHOW => show_pad(app),
            TRAY_HIDE => hide_pad(app),
            TRAY_THEME_ICE => {
                let _ = app.emit("glazepad-set-theme", "ice");
            }
            TRAY_THEME_SMOKE => {
                let _ = app.emit("glazepad-set-theme", "smoke");
            }
            TRAY_THEME_MINT => {
                let _ = app.emit("glazepad-set-theme", "mint");
            }
            TRAY_THEME_ROSE => {
                let _ = app.emit("glazepad-set-theme", "rose");
            }
            TRAY_OPACITY_CLEAR => {
                let _ = app.emit("glazepad-set-opacity", "clear");
            }
            TRAY_OPACITY_STANDARD => {
                let _ = app.emit("glazepad-set-opacity", "standard");
            }
            TRAY_OPACITY_LIGHT => {
                let _ = app.emit("glazepad-set-opacity", "light");
            }
            TRAY_OPACITY_ULTRA => {
                let _ = app.emit("glazepad-set-opacity", "ultra");
            }
            TRAY_AUTOSTART => {
                toggle_autostart(app);
            }
            TRAY_OPEN_DATA => open_data_dir(app),
            TRAY_ABOUT => show_about(app),
            TRAY_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_pad(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    app.manage(TrayMenuState {
        theme_ice,
        theme_smoke,
        theme_mint,
        theme_rose,
        opacity_clear,
        opacity_standard,
        opacity_light,
        opacity_ultra,
        autostart,
    });
    Ok(())
}

pub fn run() {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, pressed_shortcut, event| {
                    if pressed_shortcut == &shortcut && event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("glazepad-global-toggle", ());
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(move |app| {
            #[cfg(desktop)]
            app.global_shortcut().register(shortcut)?;
            setup_tray(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = place_window(&window);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            read_clipboard,
            write_slot_to_clipboard,
            cleanup_images,
            sync_tray_settings,
            set_window_ready,
            show_window,
            hide_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running GlazePad");
}
