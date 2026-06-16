---
name: glazepad-windows-debug-loop
description: GlazePad workflow for debugging and validating the WSL + Windows + Tauri desktop app loop. Use when tasks involve Tauri dev startup, Windows clipboard images, local state JSON, image persistence, hidden/visible window behavior, screenshots, Win32 window coordinates, cross-WSL sync, cargo check on Windows, or post-debug cleanup after IPC/storage/window bugs.
---

# GlazePad Windows Debug Loop

Use this skill when debugging GlazePad behavior that depends on Windows desktop APIs or Tauri runtime state. WSL code inspection is not enough for clipboard, window placement, transparency, global shortcuts, and image persistence.

## Environment

Repository in WSL:

```text
/home/lh/projects/GlazePad
```

Windows working copy:

```text
D:\projects\GlazePad
```

Known Windows Rust/pnpm path setup:

```powershell
$env:CARGO_HOME="D:\Softwares\Rust\cargo"
$env:RUSTUP_HOME="D:\Softwares\Rust\rustup"
$env:PATH="D:\Softwares\Rust\cargo\bin;D:\Softwares\npm-global;" + $env:PATH
```

## Core Rules

- Stop stale GlazePad/Tauri processes before rerunning desktop validation.
- Sync WSL to `D:\projects\GlazePad` before Windows checks.
- Use Windows `cargo check`, not WSL `cargo`, when WSL cargo is unavailable or the issue depends on desktop APIs.
- Surface real IPC/storage errors early; do not hide them behind generic "保存失败" while diagnosing.
- After debugging, remove diagnostic commands, broad optional types, and hand-written parsers unless they are the real fix.
- Commit only after build/check and after code has been tightened.

## Standard Commands

Sync to Windows:

```bash
rsync -a --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='src-tauri/target/' \
  --exclude='src-tauri/gen/' \
  --exclude='dist/' \
  --exclude='temp/' \
  ./ /mnt/d/projects/GlazePad/
```

Stop old processes:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command 'Get-Process glazepad -ErrorAction SilentlyContinue | Stop-Process -Force; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*D:\projects\GlazePad*" -or $_.CommandLine -like "*GlazePad-target*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
```

Windows Rust check:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '$env:CARGO_HOME="D:\Softwares\Rust\cargo"; $env:RUSTUP_HOME="D:\Softwares\Rust\rustup"; $env:PATH="D:\Softwares\Rust\cargo\bin;D:\Softwares\npm-global;" + $env:PATH; Set-Location D:\projects\GlazePad; cargo check --manifest-path src-tauri\Cargo.toml'
```

Start dev app:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '$env:CARGO_HOME="D:\Softwares\Rust\cargo"; $env:RUSTUP_HOME="D:\Softwares\Rust\rustup"; $env:PATH="D:\Softwares\Rust\cargo\bin;D:\Softwares\npm-global;" + $env:PATH; Set-Location D:\projects\GlazePad; pnpm tauri dev'
```

## Desktop Validation

Use full-screen screenshots first when diagnosing transparent-window visual issues. Cropped regions can mislead under DPI scaling.

Check window geometry with Win32 when the app appears gone, misplaced, or hidden:

```powershell
Get-Process glazepad -ErrorAction SilentlyContinue | Select-Object Id,MainWindowTitle,MainWindowHandle,Responding,Path
```

If needed, call `GetWindowRect` through PowerShell to confirm physical window bounds.

For manual UI actions, prefer user testing or app-level dev hooks. Coordinate clicking with `SetCursorPos` and `mouse_event` is fragile and should be a last resort.

## Clipboard Image Debugging

For image clipboard bugs, inspect the complete chain:

1. Rust `read_clipboard` reads image and writes a PNG into app data.
2. Tauri payload field names match frontend expectations.
3. React creates a valid internal image slot with required path, type, width, and height.
4. `save_state` writes `state.json`.
5. Preview reads the saved file.
6. `write_slot_to_clipboard` copies the saved file back to the Windows clipboard.

Common failure patterns:

- `images/*.png` exists but `state.json` lacks the image tab: frontend state or `save_state` failed.
- image tab exists but preview is broken: preview URL/protocol/read path failed.
- UI says "保存失败" with image tab visible: surface the exact Tauri error.
- enum payload fields use `image_path` while TypeScript expects `imagePath`: explicitly map or compatibility-parse both.

## State File

Windows app data normally lives at:

```text
C:\Users\lh\AppData\Roaming\com.glazepad.app
```

From WSL:

```bash
/mnt/c/Users/lh/AppData/Roaming/com.glazepad.app/state.json
/mnt/c/Users/lh/AppData/Roaming/com.glazepad.app/images/
```

When writing Chinese test state, use WSL `cat > ... <<'EOF'` to avoid PowerShell encoding surprises.

## Post-Debug Cleanup

After a bug is fixed, audit temporary patches:

- Remove debug IPC commands and log files.
- Prefer strong shared types over `serde_json::Value` and manual parsers unless schema drift is inherent.
- Keep compatibility only at external boundaries, such as clipboard payload or persisted old state.
- Restore required fields in internal TypeScript models once input normalization is done.
- Keep ErrorBoundary for transparent windows, but avoid broad global `window.onerror` status overrides unless intentionally designed.
- Run `rg` for debug leftovers:

```bash
rg -n 'debug_log|debug\.log|serde_json::Value|window.addEventListener\("error"|unhandledrejection|TODO|TEMP' src-web/src src-tauri/src
```

## Verification Before Commit

```bash
pnpm build
# then sync and run Windows cargo check
git diff --check
git status --short
```

If the user will do final manual testing, leave the latest dev app running and say exactly what was verified.
