<!-- V2EX 发帖说明：创作新主题时选择 Markdown 语法；标题复制下方「标题」一行到标题栏 -->

**标题：** Viko：一款开源的本地音视频图片处理工具

---

批量处理多个视频/图片要转格式、压体积、批量加水印，素材不必上传云端；不记 FFmpeg 命令。

把音视频/图片的转换、压缩、水印、降噪、元数据编辑收进一个工具里，支持批量任务队列，默认参数开箱即用，需要时再精调码率、分辨率、编码器。所有处理都在本机完成，**素材不必上传云端**。

## 核心亮点

- **一站式媒体处理**：转换器、压缩器、水印、降噪、元数据编辑，常用能力集中在一个应用里，不用在多个工具之间来回跳。
- **批量任务队列**：多文件一次拖入，统一配置或逐条微调；任务记录可搜索、排序，一键打开输出目录。
- **默认即用，也可精调**：不懂编码参数也能直接出结果；需要时可调 CRF/VBR、分辨率、编码器，还支持极速模式与 GPU 硬件加速（NVENC / QSV / VideoToolbox 等，视系统环境而定）。
- **本地优先，隐私可控**：媒体引擎基于 Rust `ffmpeg-next` 集成，文件留在本机，适合对素材隐私有要求的创作者和小团队。
- **跨平台桌面应用**：支持 **macOS**（Apple Silicon / Intel）、**Windows**、**Linux**，基于 Tauri 2 + React 构建，体积相对 Electron 更轻。

**能力一览：**

- **转换器**：批量转码音视频/图片，支持 GIF 等动图输出
- **压缩器**：一键批量压缩，可调质量
- **水印**：文本/图片水印，便于品牌与版权标注
- **降噪**：音视频降噪，适合日常素材优化
- **元数据**：视频/音频/图片元数据批量编辑
- **我的文件**：处理结果集中管理

## 运行界面截图

![首页](https://raw.githubusercontent.com/boy-lin/viko/main/public/app/1.png)

![转换器](https://raw.githubusercontent.com/boy-lin/viko/main/public/app/2.png)

![压缩器](https://raw.githubusercontent.com/boy-lin/viko/main/public/app/4.png)

![任务记录](https://raw.githubusercontent.com/boy-lin/viko/main/public/app/5.png)

## 访问与下载

本项目完全开源，提供各平台安装包下载。

- **下载安装**：https://avi.2342342.xyz
- **GitHub 开源地址**：https://github.com/boy-lin/viko

安装后打开即可使用，首次处理可直接采用默认参数；有进阶需求时再逐步调整即可。

## 技术栈

如果你对 Tauri + FFmpeg 集成感兴趣，这个项目也许值得一看：

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS + Zustand
- **桌面端**：Tauri 2
- **媒体引擎**：Rust `ffmpeg-next` 8.x（codec / format / filter / scaling / resampling）
- **License**：MIT，欢迎 Fork 二次开发

从源码运行：

```bash
git clone https://github.com/boy-lin/viko.git
cd viko
corepack enable && pnpm install
pnpm check:deps    # macOS / Linux 检查 FFmpeg 开发库
pnpm tauri:dev
```

## 适合谁用

- **内容创作者**：批量转码、压缩、加水印
- **隐私敏感用户**：素材不上传云端，数据留在本机
- **开发者**：基于 Tauri + FFmpeg 二次扩展
- **入门用户**：默认参数即用，逐步学习进阶选项
