# Android 1.0.2 多机型横屏适配版

本版本只更新 Android 应用的横屏界面与弹窗布局，浏览器版和 Windows 1.0.0 安装程序保持不变。

## 安装包

```text
release/android/China-Humanities-Museum-1.0.2.apk
```

- 包名：`com.hilihuo.chinaroad`
- `versionCode`：`3`
- `versionName`：`1.0.2`
- 最低系统：Android 7.0（API 24）
- 文件大小：445.02 MiB
- SHA-256：`4026E1032DF7A1F112135BE9C16CF144D74A6A0044C893039D9F9ED61DB3C4D8`

## 修复内容

- Android 首页默认收起人文史卷目录，并隐藏会覆盖正文的桌面端左右缩略图墙。
- 首页标题、说明和开始按钮按动态横屏高度缩放，兼容短屏及带挖孔、圆角和系统导航区域的设备。
- 纪元切换时的八字过场改为横向自适应，避免顶部和底部字符被裁切。
- 人文图片弹窗改为横屏左右布局，画布使用等比完整显示，不再压扁或拉长图片。
- 人物、事件和历史现场弹窗沿用同一套动态可用高度和安全区约束。
- 3D 模型与参考图在视觉区域中互斥切换，各自占满可用区域，避免上下分割导致两者同时显示不全。
- 3D 说明保留为独立滚动栏，不挤压模型与参考图的完整轮廓。
- 加强图片弹窗关闭按钮的背景和边框对比度。

## 适配原则

- 仅通过 `html.android-app` 作用域启用，网页与 Electron 界面不受影响。
- 使用 `dvh`、`clamp()`、弹性网格和 Android 安全区域变量，不依赖单一手机分辨率。
- 面向 realme、OPPO、vivo、小米、荣耀等常见 18:9 至 21:9 横屏手机，并兼顾 Android 平板。

## 验证结果

- Vite 生产构建成功。
- Capacitor Android 资源同步成功。
- Gradle Release 构建成功。
- APK zipalign 对齐验证通过。
- APK Signature Scheme v2、v3 验证通过。
- 包名、`versionCode 3` 和 `versionName 1.0.2` 已通过 `aapt2` 校验。
- 使用与旧版本相同的发布证书签名，可直接覆盖安装 1.0.0 或 1.0.1。
