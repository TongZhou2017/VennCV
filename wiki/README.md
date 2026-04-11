# GitHub Wiki 源文件说明

本目录中的 Markdown 用于维护 **GitHub Wiki** 的页面内容，与仓库根目录面向用户的 [README.md](../README.md) 分离。

## 如何发布到 GitHub Wiki

1. 在 GitHub 上打开本仓库 → **Settings** → **Features** → 勾选 **Wikis**（若尚未开启）。
2. 克隆 Wiki 仓库（Fork 仓库时请把 URL 换成你的 `用户名/仓库名`）：

   ```bash
   git clone https://github.com/TongZhou2017/VennCV.wiki.git venncv-wiki
   cd venncv-wiki
   ```

3. 将本目录下下列文件**复制到** `venncv-wiki` 根目录（可覆盖同名文件）：
   - `Home.md` → Wiki 首页
   - `_Sidebar.md` → 侧栏（若 Wiki 已启用自定义侧栏）
   - 其余 `*.md` 各对应一篇 Wiki 子页面

4. 在 `venncv-wiki` 中提交并推送：

   ```bash
   git add .
   git commit -m "Sync wiki from main repo"
   git push
   ```

**注意**：不要复制本文件 `README.md` 到 Wiki 仓库，它只是给主仓库贡献者看的说明。

## Wiki 内链写法

在 GitHub Wiki 正文中，页面之间的链接一般为：

```markdown
[从源码构建](Building-from-source)
```

其中括号内为**目标页面的标题**（与 Wiki 上显示的页面名一致，通常对应去掉 `.md` 后的文件名；若 GitHub 将空格显示为连字符，以 Wiki 上实际 URL 为准）。

## 与本地 `docs/`（不纳入 Git）

开发历程类 Markdown（路线图、调试清单、日志设计稿等）默认放在仓库旁的 **`docs/`** 目录，**仅本地或私有备份**，已由根目录 `.gitignore` 排除，**不会**出现在克隆下来的仓库里。

- **Wiki**：对外公开的贡献者说明（构建、发版、目录结构等）。
- **本地 `docs/`**：团队内部迭代记录；若需与他人共享，可节选同步到 Wiki 新页面，或另存私有仓库。

主仓库若调整构建步骤，请**同步更新**本 `wiki/` 目录对应页面后再推送到 GitHub Wiki。
