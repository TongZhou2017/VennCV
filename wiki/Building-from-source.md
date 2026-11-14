# 从源码构建

## 环境要求

- **Node.js**：20 或更高
- **Rust**：stable（参见 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)）
- **可选**：构建遗留 **Trunk + egui WASM** 时需安装 [trunk](https://trunkrs.dev/)，并添加目标 `rustup target add wasm32-unknown-unknown`

## Web 前端（主界面）

```bash
cd web
npm install
npm run dev       # http://127.0.0.1:5173
npm run build     # 输出 web/dist
npm test          # Vitest
npm run lint
```

## 桌面端（Tauri）

在**仓库根目录**（推荐）：

```bash
npm install          # 安装 @tauri-apps/cli 等
npm run tauri:dev    # 启动 Vite（web）并打开桌面窗口
npm run tauri:build  # 先构建 web/dist，再打包桌面应用
```

在 `web/` 下也可执行 `npm run tauri:dev` / `npm run tauri:build`（脚本会转发到根目录）；**仍需先在根目录执行过一次 `npm install`**。

Tauri 的 `beforeDevCommand` / `beforeBuildCommand` 使用 `npm --prefix web`，工作目录为仓库根目录。

**macOS**：系统菜单含 VennCV、文件、编辑、视图、账户；**设置…** 为 ⌘,，与工具栏一致。

## Rust 库（根目录 `Cargo.toml`）

```bash
cargo build
cargo test
```

数据模型等在 `src/`；与 Web 端 JSON 约定见代码与 [CHANGELOG.md](https://github.com/TongZhou2017/VennCV/blob/master/CHANGELOG.md)。

## 遗留 Trunk（egui WASM）

可选路径，日常开发可忽略。

```bash
cd legacy/wasm
# 若 NO_COLOR=1 导致 trunk 报错：
# env -u NO_COLOR trunk serve
trunk build
trunk serve
```

- 配置：[legacy/wasm/Trunk.toml](https://github.com/TongZhou2017/VennCV/blob/master/legacy/wasm/Trunk.toml)
- 入口 HTML 通过 `../../Cargo.toml` 引用仓库根 `Cargo.toml`
- 构建产物输出到 `legacy/wasm/dist/`（已在 `.gitignore` 中）

## E2E（Playwright）

配置会启动 `legacy/wasm` 下的 `trunk serve`，默认端口 **8081**（与 `legacy/wasm/Trunk.toml` 一致）。

```bash
cd e2e
npm install
npx playwright install chromium
npm test
```

已手动启动 `trunk serve` 时可：`PW_TEST_WEB_SERVER=0 npm test`。

## 字体与中文字形

- 字体文件位于 **`web/public/fonts/`**（Noto Sans SC 及许可说明）
- Web：`index.css` 中 `@font-face` 与 `font-family`
- egui WASM：`src/lib.rs` 中 `include_bytes!` 指向同一路径下的 OTF
