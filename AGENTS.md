# Repository Guidelines

## 项目结构

- 前端：`src/` (React + TypeScript + Vite + Tailwind)
- 桌面端：`src-tauri/` (Rust + Tauri)
- 静态资源：`public/`

## 开发命令

- `pnpm install` - 安装依赖
- `pnpm dev` - 前端开发
- `pnpm tauri:dev` - 桌面应用开发
- `pnpm build` - 前端构建
- `pnpm tauri:build` - 桌面应用打包

## 代码规范

- TypeScript + React 18
- 组件命名：帕斯卡式（`VideoCard`）
- Hooks 命名：`use` 前缀（`useTranscode`）
- 状态管理：Zustand
- UI 组件：Radix UI + Tailwind CSS

## 依赖说明

- **ffmpeg-next**: 版本 8.0.0，用于音视频处理
  - Features: `codec`, `format`, `filter`, `software-scaling`, `software-resampling`
  - 需要编译时链接 FFmpeg 库（系统需安装 FFmpeg 开发库）
  - 用于视频/音频/图片转换、媒体信息获取、缩略图生成等功能

## 媒体处理约束

- 当前项目媒体处理主链路基于 Rust `ffmpeg-next` 集成实现，不是默认通过 `ffmpeg` CLI 子进程完成。
- 排查媒体转换、水印、缩略图、GIF/APNG、任务队列问题时，优先检查这些路径：
  - `src-tauri/src/services/convert/video.rs`
  - `src-tauri/src/services/convert/audio.rs`
  - `src-tauri/src/services/convert/image.rs`
  - `src-tauri/src/services/convert/gif.rs`
  - `src-tauri/src/media_common/`
  - `src-tauri/src/task/queue.rs`
  - `src-tauri/src/commands/mod.rs`
- 要把 `ffmpeg-next` 的 Rust filter graph 行为和 `ffmpeg` CLI 行为视为“相关但不完全等价”。
- 不能因为等价 `ffmpeg` CLI 命令成功，就直接判定 Rust 主链路实现正确。
- `ffmpeg` CLI 在本项目里主要用于验证和差异诊断，不应默认作为主实现方案。

### 媒体问题排查顺序

1. 从前端日志拿到任务 payload。
2. 依次检查：
   - `mediaTaskEvent.ts`
   - `mediaTaskQueue.ts`
   - `commands/mod.rs`
   - `task/queue.rs`
   - 对应 Rust service
3. 如果涉及水印或滤镜，打印最终 `filter_spec`。
4. 对比：
   - Rust `ffmpeg-next` 路径结果
   - 等价 `ffmpeg` CLI 命令结果
5. 如果 CLI 成功但 Rust 失败，优先按 Rust 集成问题处理。

### 水印与跨平台注意事项

- 水印问题要区分：
  - 用户水印
  - 强制水印
- Windows 路径问题要分别验证：
  - `movie=`
  - `drawtext fontfile=`
- PNG/JPG 图片水印问题至少要分别验证：
  - 最小 `movie=filename=...`
  - 完整 `filter_complex` overlay 命令
- 必须显式考虑跨平台差异。macOS 成功不代表 Windows 下 `ffmpeg-next` 行为一致。
- 不要优先把 `Cargo.toml` feature 配置当成根因，除非已经有证据表明模块不可用或链接库存在差异。

## 提交规范

- 遵循 Conventional Commits
- 确保 `pnpm build` 和 `pnpm tauri:dev` 无错误
