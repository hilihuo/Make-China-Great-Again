# 1.0.0 原生安装包

构建日期：2026-07-15

## Windows

```text
文件：China-Humanities-Museum-1.0.0-Setup.exe
大小：552,600,543 bytes（527.00 MiB）
SHA-256：FD8C882FD1C91F64698F96939DD68B87CCD26CD24F832A0CCFB60BB0ED9A8F1E
```

验证结果：NSIS 安装程序成功生成，打包后的 Electron 应用已完成启动冒烟测试，页面标题、主 Canvas 和首页均正常加载。

## Android

```text
文件：China-Humanities-Museum-1.0.0.apk
大小：466,635,149 bytes（445.02 MiB）
SHA-256：250CBADE86BFF321845ABB5F6E5DC1FABF6B31F7215A4B83D8B58B2A515F4DAE
包名：com.hilihuo.chinaroad
版本：1.0（versionCode 1）
最低系统：Android 7.0 / API 24
目标系统：API 36
```

验证结果：Release APK 已执行 ZIP 对齐，并通过 APK Signature Scheme v2 与 v3 签名验证；应用标签、启动 Activity、横屏配置和 SDK 范围均已由 Android Build Tools 检查。

安装包位于本机 `release/`，该目录不进入 Git。上传时请将两个文件作为 GitHub Release 附件，并保留本文件中的 SHA-256 供下载者校验。
