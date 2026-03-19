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

## 提交规范

- 遵循 Conventional Commits
- 确保 `pnpm build` 和 `pnpm tauri:dev` 无错误
