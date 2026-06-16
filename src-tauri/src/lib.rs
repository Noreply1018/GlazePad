use arboard::{Clipboard, ImageData};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use std::{borrow::Cow, fs, path::PathBuf};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use uuid::Uuid;

type AppResult<T> = Result<T, String>;
const PAD_WINDOW_WIDTH: f64 = 422.0;
const PAD_WINDOW_HEIGHT: f64 = 372.0;
const WAKE_WINDOW_WIDTH: f64 = 10.0;
const WAKE_WINDOW_HEIGHT: f64 = 86.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppState {
    active_id: String,
    hidden: bool,
    slots: Vec<Slot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Slot {
    #[serde(rename = "text")]
    Text {
        id: String,
        title: String,
        content: String,
    },
    #[serde(rename = "image")]
    Image {
        id: String,
        title: String,
        #[serde(default)]
        content: String,
        image_path: String,
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
        image_path: String,
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
    fs::write(path, raw).map_err(|err| format!("无法写入本地状态：{err}"))
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
    place_sized_window(window, LogicalSize::new(PAD_WINDOW_WIDTH, PAD_WINDOW_HEIGHT))
}

fn place_wake_edge(window: &WebviewWindow) -> AppResult<()> {
    place_sized_window(window, LogicalSize::new(WAKE_WINDOW_WIDTH, WAKE_WINDOW_HEIGHT))
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
        .setup(move |app| {
            #[cfg(desktop)]
            app.global_shortcut().register(shortcut)?;

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
            set_window_ready,
            show_window,
            hide_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running GlazePad");
}
