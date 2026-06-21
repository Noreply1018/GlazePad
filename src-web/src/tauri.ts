import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isEnabled } from "@tauri-apps/plugin-autostart";

export type ThemeName = "ice" | "smoke" | "mint" | "rose";
export type OpacityLevel = "clear" | "standard" | "light" | "ultra";

export type AppSettings = {
  theme: ThemeName;
  opacity: OpacityLevel;
  autostart: boolean;
};

export type TextSlot = {
  id: string;
  title: string;
  type: "text";
  content: string;
};

export type ImageSlot = {
  id: string;
  title: string;
  type: "image";
  content: "";
  imagePath: string;
  imageType: string;
  width: number;
  height: number;
};

export type Slot = TextSlot | ImageSlot;

export type AppState = {
  activeId: string;
  hidden: boolean;
  settings: AppSettings;
  slots: Slot[];
};

export type ClipboardPayload =
  | { type: "text"; content: string }
  | {
      type: "image";
      imagePath?: string;
      image_path?: string;
      imageType?: string;
      image_type?: string;
      width: number;
      height: number;
    }
  | { type: "empty" };

const isTauri = "__TAURI_INTERNALS__" in window;

export function imageSrc(path: string): string {
  if (!path) return "";
  if (!isTauri) return path;

  return convertFileSrc(path);
}

export async function loadState(): Promise<AppState | null> {
  if (!isTauri) return null;
  return invoke<AppState | null>("load_state");
}

export async function saveState(state: AppState): Promise<void> {
  if (!isTauri) return;
  await invoke("save_state", { state });
}

export async function cleanupImages(state: AppState): Promise<void> {
  if (!isTauri) return;
  await invoke("cleanup_images", { state });
}

export async function readClipboard(): Promise<ClipboardPayload> {
  if (isTauri) return invoke<ClipboardPayload>("read_clipboard");

  const text = await navigator.clipboard?.readText().catch(() => "");
  return text?.trim() ? { type: "text", content: text } : { type: "empty" };
}

export async function readAutostart(): Promise<boolean> {
  if (!isTauri) return false;
  return isEnabled();
}

export async function syncTraySettings(settings: AppSettings): Promise<void> {
  if (!isTauri) return;
  await invoke("sync_tray_settings", {
    theme: settings.theme,
    opacity: settings.opacity,
    autostart: settings.autostart,
  });
}

export async function writeSlot(slot: Slot): Promise<void> {
  if (isTauri) {
    await invoke("write_slot_to_clipboard", { slot });
    return;
  }

  if (slot.type === "text") {
    await navigator.clipboard.writeText(slot.content);
  }
}

export async function showWindow(): Promise<void> {
  if (isTauri) await invoke("show_window");
}

export async function hideWindow(): Promise<void> {
  if (isTauri) await invoke("hide_window");
}

export async function setWindowReady(hidden = false): Promise<void> {
  if (isTauri) await invoke("set_window_ready", { hidden });
}

export async function listenGlobalToggle(callback: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen("glazepad-global-toggle", callback);
}

export async function listenTrayHide(callback: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen("glazepad-tray-hide", callback);
}

export async function listenAbout(callback: (message: string) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen<string>("glazepad-about", (event) => callback(event.payload));
}

export async function listenTrayTheme(callback: (theme: ThemeName) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen<ThemeName>("glazepad-set-theme", (event) => callback(event.payload));
}

export async function listenTrayOpacity(callback: (opacity: OpacityLevel) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen<OpacityLevel>("glazepad-set-opacity", (event) => callback(event.payload));
}

export async function listenTrayAutostart(callback: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen("glazepad-toggle-autostart", callback);
}

export async function listenAutostartChanged(callback: (enabled: boolean) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen<boolean>("glazepad-autostart-changed", (event) => callback(event.payload));
}

export async function listenAutostartFailed(callback: (message: string) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen<string>("glazepad-autostart-failed", (event) => callback(event.payload));
}
