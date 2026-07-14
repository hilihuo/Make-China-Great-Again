# 使用 GitHub Desktop 上传项目

项目已经完成本地 Git 提交，当前待发布分支为 `main`，正式项目资源约 377 MB。GitHub 远端仓库目前为空，尚未收到提交。

## 为什么建议使用 GitHub Desktop

GitHub Desktop 可以通过浏览器完成 GitHub 账号授权，适合当前命令行凭据管理器无法继续认证的情况。它还会显示图片资源上传进度和最终发布结果。

## 第一步：让 GitHub Desktop 识别项目

当前项目使用 `.gitdata` 保存完整 Git 元数据，因为工作区中原有的空 `.git` 目录无法由自动化环境写入。先在 PowerShell 中执行：

```powershell
Set-Location 'C:\Users\hilih\Documents\Projects\RW'
powershell -ExecutionPolicy Bypass -File '.\scripts\prepare-github-desktop.ps1'
```

脚本会执行三项安全检查：确认当前目录是项目根目录、确认 `.gitdata` 存在、确认原 `.git` 为空。它不会删除文件；空 `.git` 会被保留为 `.git-empty-backup`，然后 `.gitdata` 会改为标准 `.git`。

## 第二步：在 GitHub Desktop 中添加项目

1. 打开 GitHub Desktop，登录 `hilihuo` 对应的 GitHub 账号。
2. 选择 **File > Add local repository**。
3. 选择目录 `C:\Users\hilih\Documents\Projects\RW`。
4. 确认当前分支为 `main`，本地历史中存在 `Initial release: immersive Chinese humanities museum` 提交。

## 第三步：发布到指定仓库

远端地址已经配置为：

```text
https://github.com/hilihuo/Make-China-Great-Again.git
```

在 GitHub Desktop 中点击 **Push origin**。如果界面显示 **Publish repository**，请确认仓库名为 `Make-China-Great-Again`、所有者为 `hilihuo`，不要创建同名的第二个仓库。

正式图片资源较多，首次上传可能需要数分钟。上传过程中不要关闭 GitHub Desktop，也不要让电脑进入睡眠。

## 上传完成后的检查

访问 <https://github.com/hilihuo/Make-China-Great-Again>，确认：

- 默认分支是 `main`；
- 可以看到 `README.md`、`src/`、`public/images/`；
- 最新提交信息与 GitHub Desktop 中一致；
- `node_modules/`、`dist/`、根目录重复的 `images/` 和临时文件没有进入仓库。

项目中的正式资源没有单个文件超过 GitHub 的 100 MB 限制，因此不需要 Git LFS。
