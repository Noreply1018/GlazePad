# GlazePad 文档

这个目录只保存维护 GlazePad 必要的长期文档。每份文档都有固定职责，避免同一信息在多处重复。

## 文档分工

- [design.md](./design.md)：当前产品形态和交互规范。
- [development.md](./development.md)：开发环境、状态存储、验证命令和实现边界。
- [release.md](./release.md)：发布前后的固定检查清单。
- [roadmap.md](./roadmap.md)：未来计划和暂不计划。
- [archive/](./archive/)：历史原型、旧设计和只作参考的资料。

顶层 [README.md](../README.md) 面向首次进入仓库的人，只写产品简介、安装、基本使用和关键链接。顶层 [CHANGELOG.md](../CHANGELOG.md) 只写版本历史。

## 维护规则

- 产品当前行为写在 `design.md`；不要在 `roadmap.md` 或 `development.md` 重复完整交互说明。
- 开发命令、环境约束、数据结构和验证方式写在 `development.md`；不要写成产品介绍。
- 发布步骤、安装包验证和 Release 检查写在 `release.md`；不要放进 README 正文。
- 已完成的功能写进 `CHANGELOG.md`，不要留在 `roadmap.md`。
- `roadmap.md` 只写未来要做、正在评估或明确暂不做的事情。
- 历史原型和过期方案放进 `archive/`，引用时必须说明它不是当前规范。
- 修改用户可见行为时，至少检查 `README.md`、`design.md`、`release.md` 和 `CHANGELOG.md` 是否需要同步。
- 修改版本号或发布流程时，至少检查 `README.md`、`release.md`、`CHANGELOG.md`、`package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml`。
