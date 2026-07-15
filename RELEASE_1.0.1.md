# Android 1.0.1 横屏布局修复版

本版本只更新 Android 应用的纪元首页布局，Windows 安装程序保持 1.0.0 不变。

## 安装包

```text
release/android/China-Humanities-Museum-1.0.1.apk
```

- 包名：`com.hilihuo.chinaroad`
- `versionCode`：`2`
- `versionName`：`1.0.1`
- 最低系统：Android 7.0（API 24）
- 文件大小：445.02 MiB
- SHA-256：`DD8E38E63C4F9341469BDE1CF0D1D3C4E703FB63B78D88346980007B2087B26D`

## 修复内容

- 仅在 Capacitor Android 应用中启用独立横屏布局，浏览器版和 Windows 版不受影响。
- 将纪元内容卡片固定在右半屏，并改为紧凑图文双栏。
- 保证“人文图片、人物还原、事件还原、历史现场、3D 展示”五个按钮同时位于可视区域。
- 将底部纪元导航收窄到左半屏，避免遮挡右侧内容和按钮。
- 保留中央人物展示，并为状态栏、导航栏安全区域预留边距。
- 固定 Android WebView 文字缩放比例，避免系统自动放大导致按钮再次溢出。

## 验证结果

- 生产构建成功。
- APK zipalign 对齐验证通过。
- APK Signature Scheme v2、v3 验证通过。
- 使用与 1.0 相同的发布证书签名，可以直接覆盖安装旧版本。
- 短横屏模拟视口为 `480 × 263` CSS 像素，五个操作按钮与底部导航的边界均完整位于屏幕内。

