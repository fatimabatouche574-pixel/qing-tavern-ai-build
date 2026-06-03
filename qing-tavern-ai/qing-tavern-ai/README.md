# 青樽 QingTavern AI

本项目是一个本地酒馆式 AI 聊天软件原型，主打移动端使用体验：自定义 API、导入/自制角色卡、多聊天记录、树状分支剧情、消息编辑/删除、AI 推荐玩家回复、继续推进剧情、头像/聊天背景替换、主题一键切换。

> 当前交付为完整源码 ZIP。由于当前运行环境没有 Android SDK 和 Gradle，无法在这里直接生成 APK；但 `android/` 目录已经准备好原生 Android WebView 壳，导入 Android Studio 后可构建 APK。

## 已实现功能

- 自定义 API 接口
  - OpenAI-compatible Chat Completions 格式。
  - 自定义 JSON Body 模板，支持变量：`{{model}}`、`{{messagesJson}}`、`{{prompt}}`、`{{promptJson}}`、`{{temperature}}`、`{{maxTokens}}`。
  - 自定义响应路径，例如 `choices.0.message.content`。
  - API Key 与配置保存在本机 IndexedDB。
- 角色卡
  - 新建角色卡。
  - 编辑角色名、描述、性格、场景、开场白、示例对话、系统提示、标签。
  - 更换头像与聊天背景。
  - 导出角色卡 JSON。
- 角色卡导入
  - JSON：兼容 TavernAI / SillyTavern 常见 V1/V2 字段。
  - PNG：解析 `tEXt` / 未压缩 `iTXt` 中的 `chara` / `ccv2` / `ccv3` / `card` / `character` 元数据。
  - YAML / YML：基础字段解析。
  - TXT / MD：进入手动映射导入。
  - ZIP / CHARX：尝试解压并导入其中的 JSON / PNG / YAML / TXT / MD。
  - WEBP / 普通图片：作为头像导入，角色内容进入默认/手动补充。
  - 未知格式：进入手动映射模式。
- 聊天结构
  - 一个角色支持多个独立聊天记录。
  - 同一聊天内支持树状分支。
  - 从任意消息继续，下一条消息会形成新分支。
  - 兄弟分支可在消息下方切换。
  - 消息可直接编辑、编辑为新分支、删除。
- AI 辅助
  - `三条推荐回复`：生成三条玩家可直接点击填入的回复。
  - `继续`：不需要玩家输入，让 AI 沿当前分支继续推进剧情。
- 移动端体验
  - 输入框会使用 `visualViewport` 贴合输入法键盘上沿。
  - Android 壳使用 `adjustResize`，并通过 NativeBridge 发起网络请求，减少浏览器 CORS 问题。
  - PWA manifest 与 service worker 已准备好，可浏览器安装到桌面。
- 主题
  - 薄荷晨雾、樱花晴昼、夜航星河、奶油纸页、青瓷雨巷。

## 重要边界

“市面上所有角色卡文件类型完美兼容”在现实中不可保证，因为很多平台没有公开稳定规范，甚至会使用私有导出、压缩包、图片元数据或非标准字段。本项目采取的是：优先兼容主流 TavernAI / SillyTavern 风格 JSON 与 PNG 内嵌 JSON，再提供 ZIP/CHARX 提取、YAML/TXT 导入和未知格式手动映射。

PNG 压缩文本块 `zTXt` 与压缩 `iTXt` 暂未内置解析；如果遇到这类卡片，可先用外部工具转成 JSON 或普通 PNG `tEXt` 卡再导入。

## 桌面/Web 运行

```bash
cd qing-tavern-ai
npm run serve
```

然后打开：

```text
http://localhost:5173
```

也可以直接打开 `web/index.html`，但直接 `file://` 打开时 service worker 不会启用，部分浏览器对文件选择和跨域请求也更严格。

## API CORS 说明

浏览器版如果直接请求某些模型 API，可能被 CORS 拦截。解决办法有三种：

1. 用 Android 版。Android WebView 壳内置 `QingTavernNative`，网络请求由原生 Java 发出。
2. 使用支持浏览器 CORS 的 API 服务。
3. 桌面调试时启动本地代理：

```bash
cd qing-tavern-ai
npm run proxy
```

然后把设置里的 Endpoint URL 改成类似：

```text
http://localhost:8787/proxy?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fchat%2Fcompletions
```

为了安全，可以设置允许转发的域名：

```bash
QT_PROXY_ALLOW=api.example.com,openrouter.ai npm run proxy
```

## Android APK 构建

当前 ZIP 内的 Android 项目位于：

```text
android/
```

构建方式：

1. 安装 Android Studio。
2. 打开 `qing-tavern-ai/android` 目录。
3. 等待 Gradle 同步。
4. 菜单选择 `Build > Build APK(s)`。
5. 生成的 APK 通常在：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

命令行构建需要你本机有 Android SDK 和 Gradle：

```bash
cd qing-tavern-ai/android
gradle assembleDebug
```

如果本机安装的 SDK 不是 35，可在 `android/app/build.gradle` 中把 `compileSdk` / `targetSdk` 调整为你本机已安装的版本。

## 同步 Web 资源到 Android assets

如果修改了 `web/` 下的前端文件，运行：

```bash
bash tools/sync_android_assets.sh
```

然后重新构建 APK。

## 数据存储与备份

聊天、角色卡、API 设置、头像和背景默认保存在浏览器/WebView 的 IndexedDB 中。设置页提供：

- 导出全部数据。
- 导入备份。

卸载 App 或清除浏览器数据前，请先导出备份。

## 目录结构

```text
qing-tavern-ai/
  web/                         # 纯前端 PWA，本地可运行
  android/                     # Android WebView 壳，可用 Android Studio 构建 APK
  server/static-server.mjs      # 本地静态服务器
  server/qt-proxy.mjs           # 可选 CORS 代理
  tools/sync_android_assets.sh  # 同步前端到 Android assets
```
