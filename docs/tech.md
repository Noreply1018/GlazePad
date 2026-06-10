# GlazePad 技术准备

## 开发环境结论

当前项目目录位于 WSL 中：

```text
/home/lh/projects/GlazePad
```

代码可以主要在 WSL 中编辑和管理，但 GlazePad 强依赖 Windows 桌面能力。涉及窗口置顶、全局快捷键、系统剪贴板、Windows 侧边栏行为、打包发布时，应在 Windows 原生环境中运行和测试。

## 推荐技术栈

主路线：

- Tauri
- React
- TypeScript
- Vite
- pnpm

选择理由：

- 适合做轻量常驻桌面工具。
- 相比 Electron，Tauri 体积和内存占用更适合长期运行。
- React 和 TypeScript 便于构建可维护的卡片、Tab、状态管理和设置界面。
- Vite 和 pnpm 能提供较快的本地开发体验。

## 当前本机工具审计

WSL 当前已有：

- Node.js `v22.22.2`
- npm `10.9.7`
- pnpm `10.33.0`
- Python `3.12.3`
- Git `2.43.0`

WSL 当前缺少：

- `rustc`
- `cargo`

由于最终应用需要在 Windows 桌面环境中运行，Windows 原生侧也需要准备对应工具。

## Windows 侧需要安装

后续在 Windows 原生环境中建议安装：

1. Node.js LTS
2. pnpm
3. Rust toolchain
4. Tauri CLI
5. Microsoft Edge WebView2 Runtime
6. Visual Studio Build Tools，并安装 C++ 构建工具
7. Git for Windows

其中 Rust、WebView2、Visual Studio Build Tools 是 Tauri 在 Windows 上开发和打包时的关键依赖。

## 本地数据方案

第一版建议使用完全本地化存储，不做云同步。

可选方案：

- SQLite：更适合后续扩展搜索、排序、迁移和结构化查询。
- JSON 加图片文件目录：实现更简单，适合早期原型。

当前建议：

- 第一版可以先使用 JSON 或轻量文件存储快速验证体验。
- 如果后续需要搜索、标签、归档、迁移，再切换到 SQLite。

图片建议保存为本地文件，数据记录中只保存图片路径和元信息。不要将图片转成 base64 长期塞进 JSON，避免文件膨胀和读写成本上升。

## 待验证的 Windows 能力

以下能力需要在 Windows 原生环境中验证：

- 全局快捷键注册是否稳定。
- 读取和写入文本剪贴板。
- 读取和写入图片剪贴板。
- 无边框或自定义窗口外观。
- 窗口置顶。
- 右侧吸附和尺寸调整。
- 多显示器下窗口定位。
- 高 DPI 缩放下的尺寸和位置表现。

第二阶段再验证：

- 鼠标贴边唤醒。
- AppBar 挤压屏幕模式。
- Acrylic 或 Mica 视觉效果。

## 建议开发阶段

### P0：环境与技术验证

- 初始化项目。
- 在 Windows 原生环境跑通 Tauri 开发模式。
- 验证全局快捷键。
- 验证文本和图片剪贴板读写。
- 验证本地保存。

### P1：MVP

- 侧边栏窗口。
- Tab 管理。
- 智能加号。
- 文本卡片。
- 图片卡片。
- 复制、编辑、删除、清空。
- 半永久本地保存。

### P2：Windows 体验增强

- 鼠标贴边唤醒。
- 更自然的滑入滑出动画。
- 多显示器适配。
- 高 DPI 适配。
- 窗口位置和宽度记忆。

### P3：视觉和高级能力

- 更完整的浅色视觉系统。
- Acrylic 或 Mica。
- 搜索。
- 快捷键自定义。
- 撤销清空。
- 更细粒度的数据管理。
