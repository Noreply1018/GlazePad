import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

export async function imageSrc(path: string): Promise<string> {
  if (!path) return "";
  if (!isTauri) return path;

  return invoke<string>("read_image_data_url", { imagePath: path });
}

export async function loadState(): Promise<AppState | null> {
  if (!isTauri) return null;
  return invoke<AppState | null>("load_state");
}

export async function saveState(state: AppState): Promise<void> {
  if (!isTauri) return;
  await invoke("save_state", { state });
}

export async function readClipboard(): Promise<ClipboardPayload> {
  if (isTauri) return invoke<ClipboardPayload>("read_clipboard");

  const text = await navigator.clipboard?.readText().catch(() => "");
  return text?.trim() ? { type: "text", content: text } : { type: "empty" };
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
