# 使用 GitHub Desktop 上传项目

目标仓库：

```text
https://github.com/hilihuo/Make-China-Great-Again
```

项目目录：

```text
C:\Users\hilih\Documents\Projects\RW
```

上传分成两部分：先用 GitHub Desktop 提交源码和说明文档，再到 GitHub Releases 上传体积较大的 EXE 与 APK。不要把安装包或 Android 发布密钥加入普通 Git 提交。

## 一、确认本地仓库

当前项目已经使用标准 `.git` 目录，不需要再次转换。需要重新检查时，可在 PowerShell 7 中运行：

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\hilih\Documents\Projects\RW\scripts\prepare-github-desktop.ps1'
```

如果显示 `The project already uses the standard .git directory.`，说明仓库状态正常。

## 二、在 GitHub Desktop 中添加项目

1. 打开 GitHub Desktop。
2. 点击 **File > Add local repository**。
3. 选择 `C:\Users\hilih\Documents\Projects\RW`。
4. 确认当前仓库为 `Make-China-Great-Again`，当前分支为 `main`。

如果项目已经出现在左上角 **Current repository** 中，不需要重复添加。

## 三、检查准备提交的文件

GitHub Desktop 左侧 **Changes** 应包含以下主要内容：

- `README.md`
- `NATIVE_APPS.md`
- `RELEASE_1.0.0.md`
- `GITHUB_DESKTOP_UPLOAD.md`
- `GITHUB_RELEASE_NOTES_1.0.0.md`
- `ZHIHU_PROMOTION_ARTICLE.md`
- `electron/` 与 `electron-builder.yml`
- `android/` 与 `capacitor.config.json`
- `package.json` 与 `package-lock.json`
- `.gitignore`

以下内容不应出现在 Changes 中：

- `release/`
- `.native-tools/`
- `.gradle-user-home/`
- `node_modules/`
- `android/app/build/`
- `android/app/src/main/assets/public/`
- `release/android/private-signing/`

如果任何 `.p12`、`.jks`、`.keystore` 或密码说明文件出现在 Changes 中，不要提交，应立即取消勾选并检查 `.gitignore`。

## 四、提交并推送源码

1. 在左下角 **Summary** 输入：

   ```text
   feat: add Windows and Android app packaging
   ```

2. 点击 **Commit to main**。
3. 提交完成后，点击窗口顶部的 **Push origin**。
4. 如果顶部显示的是 **Publish branch**，点击它即可首次发布当前分支。
5. 推送完成后点击 **View on GitHub**，确认 README 和新增文档已经显示在仓库中。

## 五、通过 GitHub Release 上传安装包

普通 Git 提交不会包含 `release/`，因此需要在 GitHub 网页单独发布：

1. 打开仓库 `https://github.com/hilihuo/Make-China-Great-Again`。
2. 点击右侧 **Releases**，然后点击 **Draft a new release**。
3. 在 **Choose a tag** 中创建 `v1.0.0`。
4. Release title 输入：

   ```text
   中华人文史卷 v1.0.0
   ```

5. 将 [GITHUB_RELEASE_NOTES_1.0.0.md](GITHUB_RELEASE_NOTES_1.0.0.md) 的内容粘贴到发布说明。
6. 上传以下两个文件：

   ```text
   C:\Users\hilih\Documents\Projects\RW\release\windows\China-Humanities-Museum-1.0.0-Setup.exe
   C:\Users\hilih\Documents\Projects\RW\release\android\China-Humanities-Museum-1.0.0.apk
   ```

7. 等待两个附件都显示上传完成，再点击 **Publish release**。

## 六、绝对不要上传的文件

以下目录包含 Android 长期发布密钥：

```text
C:\Users\hilih\Documents\Projects\RW\release\android\private-signing
```

不要把其中的 `.p12`、密码说明或任何副本上传到 GitHub、网盘公开目录或聊天工具。请将整个目录加密后单独备份；以后发布可覆盖安装的 Android 更新时必须使用同一密钥。

## 七、发布后检查

1. 在另一台电脑打开 Release 页面，确认 EXE 和 APK 都能看到。
2. 下载文件并核对 [RELEASE_1.0.0.md](RELEASE_1.0.0.md) 中的 SHA-256。
3. Windows 测试安装、启动和卸载。
4. Android 测试安装、横屏启动、人文图片、人物还原、3D 展示和语音讲解。
5. 确认 Release 页面没有发布密钥、密码或 `.native-tools` 内容。
