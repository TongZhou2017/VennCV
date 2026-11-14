欢迎来到 **VennCV** 开发者文档（GitHub Wiki）。

这里面向**从源码参与开发、打包与排错**的贡献者；普通用户请阅读仓库根目录的 [README](https://github.com/TongZhou2017/VennCV/blob/master/README.md)。

## 本 Wiki 包含

| 页面 | 内容 |
|------|------|
| [从源码构建](Building-from-source) | 环境要求、Web / Tauri / 可选 Trunk WASM 的命令 |
| [仓库结构与技术栈](Repository-layout) | 目录说明、主要依赖 |
| [发行版与 CI](Releases-and-CI) | GitHub Actions、打 tag、安装包说明 |
| [文档地图](Documentation-map) | 仓库内必读文档与 Wiki 说明（开发历程类见本地 `docs/`，不随 Git 分发） |

## 快速环境一览

- **Node.js 20+**（Web 与 Tauri CLI）
- **Rust stable**（Tauri 与根目录 `Cargo.toml` 库）
- 可选：[Trunk](https://trunkrs.dev/) + `wasm32-unknown-unknown`（仅遗留 egui WASM 路径）

更细的命令与目录约定见 [从源码构建](Building-from-source)。
