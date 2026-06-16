# GlazePad

GlazePad 是一个 Windows 桌面上的透明暂存槽，用来临时保存需要反复复用的文字或图片。

它不是完整剪贴板历史，也不是笔记软件。用户主动把当前剪贴板内容收纳进一个 Tab，需要时再一键复制回系统剪贴板。

## 当前状态

当前版本：`0.1.0`

项目仍处于早期预览阶段，`0.1.0` 是第一个公开预览版本。当前发布目标是 Windows NSIS 安装包，也就是 GitHub Release 中的 `*-setup.exe`。

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

## 安装

从 GitHub Releases 下载最新版 Windows 安装包：

```text
GlazePad_*_x64-setup.exe
```

安装后 GlazePad 会常驻系统托盘。首次运行时，Windows 可能因为安装包尚未代码签名而显示 SmartScreen 提示；确认来源是本项目 Release 后可继续运行。

## 安全下载

- 只从本仓库的 GitHub Releases 下载 GlazePad 安装包。
- 当前安装包暂未代码签名，Windows 可能显示“未知发布者”或 SmartScreen 提示。
- 发布页会记录安装包 sha256，可用于核对下载文件是否和发布资产一致。

Windows PowerShell 校验示例：

```powershell
Get-FileHash .\GlazePad_0.1.0_x64-setup.exe -Algorithm SHA256
```

## 使用

- 点击 `+` 会把当前系统剪贴板里的文本或图片收纳为新的 Tab。
- 点击复制按钮会把当前 Tab 内容写回系统剪贴板。
- 点击 `-` 会删除当前 Tab，至少保留一个暂存槽。
- 点击右上角隐藏按钮或按 `Alt + Space` 可以隐藏到屏幕右侧边缘。
- 隐藏后再次按 `Alt + Space`、点击右侧边缘或点击托盘图标可唤醒。
- 托盘菜单可显示、隐藏、打开数据目录、查看版本和退出。

## 已知限制

- 当前仅面向 Windows 公开预览。
- 暂未代码签名，可能触发 Windows SmartScreen 提示。
- 暂未提供自动更新能力。
- GlazePad 不是完整剪贴板历史，只有主动收纳进 Tab 的内容会保存。

## 卸载与数据清理

卸载程序会移除 GlazePad 的程序文件，但本地数据目录可能会保留，以避免误删用户暂存内容。

如需彻底清理数据，请在卸载后手动删除：

```text
C:\Users\<YourName>\AppData\Roaming\com.glazepad.app
```

删除该目录会清除所有 Tab、文本内容、图片文件和隐藏状态。

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

构建 Windows 安装包：

```bash
pnpm tauri build
```

当前配置只生成 NSIS 安装包，也就是 `*-setup.exe`。

## 发布

发布 `0.1.0` 时使用 tag 触发 GitHub Actions：

```bash
git tag v0.1.0
git push origin v0.1.0
```

Release workflow 会在 Windows runner 上执行前端构建、Rust 检查和 Tauri 打包，并创建草稿 GitHub Release。发布前需要下载草稿 Release 中的安装包，在干净 Windows 环境完成一次安装和核心流程验证。

## 许可证

MIT License
