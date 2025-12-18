# Repository Guidelines

## 项目结构与模块
- 前端源代码：`src/`（`pages/` 页面路由，`components/` UI 组件，`constants/` 配置常量，`lib/` 辅助方法，`assets/` 静态资源，入口 `main.tsx`/`App.tsx`）。
- 桌面端壳：`src-tauri/`（Rust 命令、`tauri.conf.json` 配置、`src/` 后端逻辑、`icons/` 应用图标、`capabilities/` 权限声明）。
- 静态资源与入口：`public/`、根目录 `index.html`。
- 设计与文档：`doc/`（设计草稿、规则、日志）、`BUILD.md`、`BUILD_WINDOWS.md`、`README.md`。

## 构建、测试与开发命令
- 安装依赖：`pnpm install`（需 Node 20+，pnpm 10.11.1，建议 `corepack enable`）。
- 本地前端：`pnpm dev`（纯前端 HMR），`pnpm preview`（构建后本地预览）。
- 桌面开发：`pnpm tauri:dev`（前端 + Tauri 壳同启）。
- 前端构建：`pnpm build`（`tsc` 类型检查后执行 `vite build`）。
- 桌面打包：`pnpm tauri:build`；平台指令如 `pnpm build:win`、`pnpm build:mac:intel`，产物输出在 `src-tauri/target/release/bundle/` 各子目录。
- 当前仓库未配置自动化测试；如新增测试，请在 PR 中说明运行命令。

## 代码风格与命名
- 语言：TypeScript + React 18，使用 Vite，Tailwind（v4 预设）与 Radix UI 组件库。
- 缩进与格式：保持现有两空格缩进；无集中格式化配置时请使用 Prettier 默认配置并避免引入全局格式化差异。
- 命名：组件使用帕斯卡式（`VideoCard`），hooks 以 `use` 前缀（`useTranscode`），常量与枚举大写蛇形，文件名与导出一致。
- 状态与样式：优先 `zustand` 管理状态，类名合并用 `clsx`/`tailwind-merge`，复用 UI 组件放入 `components/`。

## 测试指引
- 若添加测试，建议使用 Vitest/React Testing Library 与 Playwright（端到端）并在 `package.json` 中声明脚本，如 `pnpm test`。
- 测试命名：`*.test.ts(x)` 与被测文件同路径或置于 `__tests__/`，用例描述使用简洁中文/英文语义句。
- 目标：覆盖关键业务路径（转码参数校验、文件选择/对话框交互、进度展示），在 PR 中标注覆盖范围与风险。

## 提交与 Pull Request
- 提交信息建议遵循 Conventional Commits（例：`feat: add mp4 preset selector`，`fix: handle dialog cancel gracefully`）。
- PR 内容应包含：变更目的、主要改动点、测试结果（命令与摘要输出）、相关 Issue/任务链接；涉及 UI 变更附截图或录屏。
- 确保 `pnpm build`、`pnpm tauri:dev` 关键路径无报错后再提交；若改动 Rust 端，需确保 Tauri 构建通过。

## 安全与配置
- `.env`、API 密钥与证书勿入库；Tauri 权限配置在 `src-tauri/capabilities/`，新增权限需最小化暴露并在 PR 说明理由。
- Windows 构建依赖 MSVC 工具链，macOS 构建需 Xcode CLT；首次打包会拉取 Rust 目标，时间较长。
