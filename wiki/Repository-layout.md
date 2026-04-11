# 仓库结构与技术栈

## 目录结构（摘要）

```
web/                  # 主 UI：Vite + React + TypeScript
web/public/fonts/     # 中文字体（Web 与 WASM include_bytes 共用）
src-tauri/            # Tauri 2 桌面壳，加载 web/dist
legacy/wasm/          # 可选：Trunk + egui WASM；产物 legacy/wasm/dist/
src/                  # Rust：models、遗留 egui 应用、logger 等
docs/                 # （可选）仅本地的开发历程记录；根 .gitignore 已排除，克隆仓库后默认不存在
e2e/                  # Playwright（与 legacy Trunk 场景联调）
wiki/                 # 本 Wiki 的 Markdown 源文件（同步到 GitHub Wiki）
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19、Vite、TypeScript、Konva / react-konva、Zustand |
| 桌面 | Tauri 2、WebView 加载与浏览器相同的构建产物 |
| Rust | serde / serde_json、遗留 egui/eframe（Trunk 目标） |
| 存储（Web） | `localStorage`，键前缀 `venncv_fs:` |

## 数据与配置

- **Web**：工作区与用户数据通过前端存储抽象持久化（见 `web/src/storage/`）。
- **遗留 egui 桌面路径**：可能读写运行目录下的 `app_settings.yaml`；仓库提供 `app_settings.example.yaml` 作为模板，本地 `app_settings.yaml` 勿提交（见 `.gitignore`）。

## 相关页面

- [从源码构建](Building-from-source)
- [文档地图](Documentation-map)
