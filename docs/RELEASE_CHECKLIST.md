# 发布验证清单

本文档用于发布 GlazePad 新版本前后的固定检查。发布 `0.1.x` 和 `0.2.x` 时都应按此清单执行。

## 发布前

- 确认 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 版本号一致。
- 确认 `CHANGELOG.md` 已添加目标版本条目。
- 确认 README 中的当前版本、安装方式和已知限制仍准确。
- 确认工作区干净，且没有无关改动混入发布提交。
- 运行前端生产构建：

```bash
pnpm build
```

- 在 Windows 环境运行 Rust 检查：

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
```

- 在 Windows 环境构建安装包：

```powershell
pnpm tauri build
```

## 安装包验证

- 在未安装 GlazePad 的 Windows 环境完成首次安装。
- 在已安装同版本或旧版本的 Windows 环境完成覆盖安装。
- 启动后不出现黑色终端窗口。
- 启动后系统托盘存在 GlazePad 图标。
- 托盘菜单可以切换配色、调整透明度、切换开机自启动、打开数据目录、查看版本和退出。
- `Alt + Space` 可以隐藏和唤醒窗口。
- 右侧边缘点击可以唤醒窗口。
- 点击 `+` 可以新增空白文本 Tab。
- 删除 Tab 后再次新增会复用最小空缺编号。
- 右键 `+` 可以把文本剪贴板收纳为新 Tab。
- 文本 Tab 可以复制回系统剪贴板。
- 右键 `+` 可以把图片剪贴板收纳、预览并复制回系统剪贴板。
- 复制失败时会显示具体错误。
- 退出并重新启动后，Tab、当前槽位、隐藏状态、图片数据、配色和透明度仍能恢复。
- 开机自启动开关状态与 Windows 启动项一致。
- 卸载后程序文件被移除；如需彻底清理，手动删除应用数据目录。

## GitHub Release

- 推送 tag 后确认 Release workflow 成功。
- 确认 GitHub Release 指向正确 tag 和提交。
- 确认 Release 资产包含 Windows NSIS 安装包：

```text
GlazePad_<version>_x64-setup.exe
```

- 记录安装包 sha256。
- 从公开 Release 页面下载一次安装包，确认下载链接可用。
- 发布前确认 Release notes 包含功能摘要、安装说明、已知限制和 sha256。
- 正式发布后不再移动该版本 tag；如需修复，发布下一个补丁版本。
