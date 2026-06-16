---
name: glazepad-html-tauri-port
description: GlazePad workflow for pixel-faithful migration from a reference HTML/CSS prototype into the React + Tauri product. Use when implementing or auditing UI against a supplied HTML file, final prototype, screenshot, transparent floating window, hidden wake edge, or requests mentioning perfect replication, visual fidelity, CSS parity, window sizing, spacing, shadows, or reference HTML as the source of truth.
---

# GlazePad HTML To Tauri Port

Use this skill when a GlazePad task depends on matching a reference HTML/CSS artifact. Treat the reference as a specification, not inspiration.

## Core Rules

- Confirm the single visual source of truth before touching UI code.
- If the user says "perfectly replicate", copy structure, dimensions, spacing, radii, colors, opacity, shadows, and animation values from the reference unless a platform constraint prevents it.
- Do not re-design, simplify, or reinterpret the reference without saying so first.
- Prefer real Tauri window screenshots over browser-only inspection for transparent, always-on-top, borderless, hidden-state, and shadow behavior.
- Separate three layers when diagnosing mismatch: app CSS, WebView/window size, and OS/window-manager effects.

## Workflow

### 1. Establish Source Of Truth

Identify the reference file and competing docs:

```bash
rg --files docs . | rg 'prototype|design|index\.html|\.html$'
git status --short
```

If multiple design files disagree, ask or follow the user's newest explicit instruction. Record which file is authoritative in your working notes.

### 2. Extract Visual Tokens Directly

Read the reference HTML/CSS before editing:

```bash
sed -n '1,260p' <reference.html>
sed -n '260,620p' <reference.html>
```

Map values directly into the React/CSS implementation:

- window width and height;
- root padding and panel top/left;
- panel width, height, border radius, border color, background layers;
- top bar, button, tab, slot, footer dimensions;
- content area fixed height;
- hidden-state transform and wake edge dimensions;
- shadow rules and OS shadow settings.

Do not normalize palettes or spacing merely because they look cleaner.

### 3. Implement In Existing Boundaries

Keep React responsible for state and Tauri/Rust responsible for desktop capabilities. Keep visual CSS in `src-web/src/styles.css` unless the existing codebase has moved the relevant style elsewhere.

For Tauri transparent windows, check:

- `src-tauri/tauri.conf.json` window size, transparency, decorations, resizability, and visibility;
- Rust window placement and `set_shadow` behavior;
- CSS root/body dimensions and overflow;
- hidden wake window size versus visible strip size.

### 4. Verify Visually In The Real Window

Browser previews can be misleading. For real desktop validation:

- capture full-screen screenshots, not only cropped regions, when DPI or coordinate scaling may be involved;
- inspect the Tauri window rectangle through the OS;
- compare the visible panel against the reference HTML screenshot;
- verify open, hidden, wake, and re-open states separately.

Expected checks:

- no extra outer border from WebView/window mismatch;
- no unwanted OS black shadow around the main panel;
- hidden edge is at the screen side on cold start and after hide;
- content is not clipped at the bottom or right edge;
- text and tabs fit without changing layout.

### 5. Avoid False Conclusions

- A transparent app may look "gone" when the React tree crashes or the panel opacity is zero; check process, window rectangle, and screenshot.
- A screenshot crop can lie if logical and physical DPI coordinates are mixed; use full-screen capture first.
- If the reference HTML has a white page background, distinguish reference page background from actual transparent app background.
- If the UI looks correct in HTML but wrong in Tauri, inspect WebView/window sizing before changing CSS.

### 6. Finalize

Before final response or commit:

```bash
pnpm build
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
git status --short
```

When Rust/Tauri must run on Windows, use the project Windows toolchain and validate there. Commit Codex-made changes after verification, following `AGENTS.md`.
