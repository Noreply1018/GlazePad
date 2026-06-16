# GlazePad

GlazePad 是一个 Windows 桌面上的透明暂存槽，用来临时保存需要反复复用的文字或图片。

它不是完整剪贴板历史，也不是笔记软件。用户主动把当前剪贴板内容收纳进一个 Tab，需要时再一键复制回系统剪贴板。

## 当前状态

当前版本：`0.1.0`

项目仍处于早期预览阶段，`0.1.0` 会作为第一个公开预览版本继续打磨。正式 Release 和安装包会在后续确认功能、图标、构建产物后发布。

## 功能

- 透明置顶桌面浮窗
- 右侧边缘隐藏与唤醒
- 动态 Tab 暂存槽
- 文本暂存与编辑
- 真实系统剪贴板图片收纳
- 当前槽位一键复制回系统剪贴板
- 本地持久化保存

## 技术栈

- Tauri 2
- React
- TypeScript
- Vite
- pnpm
- Rust

## 本地数据

默认数据保存在 Windows 应用数据目录：

```text
C:\Users\<YourName>\AppData\Roaming\com.glazepad.app
```

主要文件：

```text
state.json
images\
```

- `state.json` 保存 Tab、当前激活槽位、隐藏状态、文本内容、图片路径和尺寸。
- `images\` 保存从剪贴板收纳进来的图片文件。

## 开发

安装依赖：

```bash
pnpm install
```

前端构建：

```bash
pnpm build
```

Tauri 开发模式：

```bash
pnpm tauri dev
```

Windows 桌面能力需要在 Windows 原生环境验证，包括：

- 系统剪贴板读写
- 图片剪贴板读写
- 透明置顶窗口
- 全局快捷键
- 右侧隐藏与唤醒

## 构建安装包

后续发布 Windows 安装包时使用：

```bash
pnpm tauri build
```

当前建议先作为开发预览运行，正式安装包会随 GitHub Release 发布。

## 许可证

MIT License
