# Windows 与 Android 原生应用

本项目同时提供 Windows `.exe` 安装程序和 Android `.apk` 安装包。两种应用都内置完整网页资源，安装后可直接打开，不需要运行 `npm run dev`，也不需要访问本地开发地址。

## 已生成的安装包

### Windows

文件：

```text
release/windows/China-Humanities-Museum-1.0.0-Setup.exe
```

安装步骤：

1. 双击安装程序。
2. 如果 Windows SmartScreen 提示来源未知，确认文件来自本项目后，点击“更多信息”与“仍要运行”。当前安装包未购买商业代码签名证书，因此可能出现该提示。
3. 安装完成后从桌面或开始菜单打开“中华人文史卷”。
4. 可在 Windows“设置 > 应用 > 已安装的应用”中卸载。

Windows 应用使用 Electron 运行，资源位于应用安装目录内，不依赖浏览器标签页或 Vite 开发服务器。

### Android

文件：

```text
release/android/China-Humanities-Museum-1.0.0.apk
```

安装步骤：

1. 将 APK 传到 Android 手机或平板。
2. 在文件管理器中点击 APK。
3. 按系统提示，允许当前文件管理器“安装未知应用”。
4. 完成安装后打开“中华人文史卷”。

系统要求与注意事项：

- Android 7.0（API 24）或更高版本。
- 推荐至少预留 1.5 GB 可用空间，以便系统解压和优化大型高清资源。
- 应用使用横屏布局；手机旋转到横屏后体验更完整，平板显示效果更好。
- 如果设备中已有使用另一签名安装的同包名测试版，系统可能提示“应用未安装”。先卸载旧版，再安装当前 Release APK。
- 当前 APK 采用项目独立发布密钥签名，并已通过 APK Signature Scheme v2/v3 验证。

## 发布密钥

本机生成的 Android 发布密钥位于：

```text
release/android/private-signing/
```

该目录包含密钥文件和本机签名信息，并已被 `.gitignore` 排除。请单独加密备份，不要提交到 GitHub，也不要发送给其他人。以后要让用户直接覆盖安装新版 APK，必须继续使用同一密钥和相同应用 ID `com.hilihuo.chinaroad`；丢失密钥后无法为现有安装发布可直接升级的版本。

## 从源码构建 Windows 应用

环境：

- Windows 10/11 x64
- Node.js 22 或更高版本
- npm

命令：

```powershell
npm install
npm run desktop:exe
```

输出：

```text
release/windows/China-Humanities-Museum-1.0.0-Setup.exe
```

本地运行桌面应用但不制作安装包：

```powershell
npm run desktop:run
```

## 从源码构建 Android 应用

环境：

- Node.js 22 或更高版本
- JDK 21
- Android SDK Platform 36
- Android SDK Build Tools 35.0.0 或更高版本
- Android Platform Tools

设置环境变量：

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
$env:ANDROID_HOME = 'C:\path\to\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
```

同步网页资源并构建可安装的调试 APK：

```powershell
npm install
npm run android:apk
```

输出：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

构建未签名 Release APK：

```powershell
npm run android:release
```

输出：

```text
android/app/build/outputs/apk/release/app-release-unsigned.apk
```

用于正式分发时，需要先执行 `zipalign`，再使用 `apksigner` 和自己的长期发布密钥签名。不要用新的临时密钥覆盖已经发布的应用版本。

## 验证安装包

Windows 文件哈希：

```powershell
Get-FileHash -Algorithm SHA256 '.\release\windows\China-Humanities-Museum-1.0.0-Setup.exe'
```

Android 文件哈希：

```powershell
Get-FileHash -Algorithm SHA256 '.\release\android\China-Humanities-Museum-1.0.0.apk'
```

使用 Android Build Tools 验证 APK 签名：

```powershell
apksigner verify --verbose --print-certs '.\release\android\China-Humanities-Museum-1.0.0.apk'
```

## 上传 GitHub

`release/` 目录默认不进入 Git，因为两个安装包都远大于普通 GitHub 文件限制。源代码继续通过 GitHub Desktop 推送；安装包应在仓库网页的 **Releases > Draft a new release** 中作为 Release 附件上传，或存放到支持大文件的下载服务。

完整的 GitHub Desktop 操作顺序、应提交文件清单和 Release 上传步骤见 [GITHUB_DESKTOP_UPLOAD.md](GITHUB_DESKTOP_UPLOAD.md)。发布页面的正文可直接使用 [GITHUB_RELEASE_NOTES_1.0.0.md](GITHUB_RELEASE_NOTES_1.0.0.md)。

发布时建议：

1. 创建标签，例如 `v1.0.0`。
2. 上传 `.exe` 和已签名 `.apk`。
3. 在发布说明中列出 Windows/Android 系统要求、文件大小和 SHA-256。
4. 不要上传 `release/android/private-signing/` 中的任何文件。

## 常见问题

### 安装后是否还要运行 PowerShell

不需要。PowerShell 和 `npm run dev` 只用于开发。安装后的 `.exe` 与 `.apk` 都可直接启动。

### 手机上的界面为什么横向显示

展厅包含常驻时间线、中央人物、内容面板和 3D 弹窗，横屏能保证控件和模型完整显示，因此 Android 应用固定使用横屏。

### APK 为什么较大

项目内置 26 个纪元的大量高清人物、人文、事件、现场和展品参考图，并包含本地 3D 展示资源。这样可以减少运行时网络依赖，但会增加安装包体积。

### GitHub Desktop 为什么看不到安装包

这是预期行为。`release/` 被忽略，避免几百 MB 的二进制文件进入 Git 历史。请使用 GitHub Release 上传安装包。
