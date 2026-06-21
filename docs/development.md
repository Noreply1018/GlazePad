# 开发说明

GlazePad 使用 Tauri 2、React、TypeScript、Vite、pnpm 和 Rust。代码可以在 WSL 中编辑，但窗口、剪贴板、全局快捷键、自启动和托盘行为必须在 Windows 原生环境验证。

## 常用命令

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

Windows Rust 检查：

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
```

构建 Windows 安装包：

```powershell
pnpm tauri build
```

## 本地数据

默认数据目录：

```text
C:\Users\<YourName>\AppData\Roaming\com.glazepad.app
```

主要内容：

- `state.json`：Tab、当前激活槽位、隐藏状态、文本内容、图片路径、尺寸、配色、透明度和自启动状态。
- `images\`：从剪贴板收纳进来的图片文件。

图片内容不应长期保存为 base64。状态文件只记录图片路径和元数据。

## 状态模型

核心状态围绕 `slot`，不是分类或列表集合：

```ts
type Slot =
  | {
      id: string;
      title: string;
      type: "text";
      content: string;
    }
  | {
      id: string;
      title: string;
      type: "image";
      imagePath: string;
      imageType: string;
      width: number;
      height: number;
    };

type AppSettings = {
  theme: "ice" | "smoke" | "mint" | "rose";
  opacity: "clear" | "standard" | "light" | "ultra";
  autostart: boolean;
};
```

旧版 `state.json` 需要兼容读取，但内部模型应保持收敛，不要把兼容逻辑扩散到 UI 组件里。

## Windows 验证范围

以下能力不能只靠 WSL 或浏览器验证：

- 系统剪贴板读写。
- 图片剪贴板读写和图片文件恢复。
- 透明置顶窗口。
- 全局快捷键。
- 右侧隐藏与唤醒。
- 系统托盘菜单。
- 开机自启动。
- 高 DPI 和多显示器定位。

发布前至少运行 `pnpm build`、Windows `cargo check`，并完成安装包手动验证。

## 实现边界

- 主界面只放高频操作：复制、删除、新建、隐藏。
- 设置入口放在托盘菜单，不放进主浮窗。
- 用户反馈优先写入顶部状态文字。
- 不为当前版本引入富文本、剪贴板历史、云同步或复杂设置页。
- 历史原型只作视觉参考，当前行为以 `docs/design.md` 为准。
