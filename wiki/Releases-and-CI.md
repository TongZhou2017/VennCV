# 发行版与 CI

## GitHub Actions

- **CI**：[`.github/workflows/ci.yml`](https://github.com/TongZhou2017/VennCV/blob/master/.github/workflows/ci.yml) — `cargo build/test`、Web 的 `build/test/lint`、Tauri debug 构建。
- **桌面发行版**：[`.github/workflows/release-tauri.yml`](https://github.com/TongZhou2017/VennCV/blob/master/.github/workflows/release-tauri.yml) — 使用 [tauri-action](https://github.com/tauri-apps/tauri-action) 在 **macOS（arm64 + x64）**、**Ubuntu**、**Windows** 构建并上传到**同一 GitHub Release**。

## 发布流程（维护者）

1. 对齐版本号：**根目录 `Cargo.toml`**、**`src-tauri/Cargo.toml`**、**`web/package.json`**（以及你认为需要同步的文件）。
2. 更新 **[CHANGELOG.md](https://github.com/TongZhou2017/VennCV/blob/master/CHANGELOG.md)**。
3. **推荐**：推送与版本一致的 tag，例如：

   ```bash
   git tag v0.12.19
   git push origin v0.12.19
   ```

4. **或**：在 Actions 中手动运行 **Release Tauri**，填写标签名；可选择草稿 Release；若标签不存在会在当前提交创建。

## 代码签名

未配置 Apple 签名密钥时，macOS 安装包仍会构建，只是未签名。用户把应用拖进「应用程序」后，若系统提示已损坏，在终端执行 `xattr -dr com.apple.quarantine /Applications/VennCV.app`。配齐密钥后，同一次发布流程会改为签名并公证。

## 用户从哪里下载

用户在仓库 **Releases** 页面下载各平台安装包；根目录 [README.md](https://github.com/TongZhou2017/VennCV/blob/master/README.md) 面向最终用户说明安装与使用。
