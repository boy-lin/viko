# 远程部署使用指南

## 快速开始

### 1. 部署 React 应用到远程服务器

首先将 React 应用部署到远程服务器（Vercel、Netlify 或自建服务器）：

```bash
# 构建 React 应用
pnpm build

# 部署到 Vercel
vercel --prod

# 或部署到 Netlify
netlify deploy --prod
```

### 2. 配置 Tauri 客户端加载远程 URL

#### 方式 1：使用环境变量（推荐）

```bash
# 设置远程 URL
export TAURI_REMOTE_URL=https://your-react-app.vercel.app

# 构建 Tauri 客户端
pnpm tauri:build
```

#### 方式 2：使用构建脚本

```bash
# 使用便捷脚本（会自动读取环境变量）
TAURI_REMOTE_URL=https://your-react-app.vercel.app pnpm build:remote
```

### 3. 开发环境（使用本地 React）

开发时不需要设置环境变量，会自动使用本地 React：

```bash
# 正常开发，使用本地 React
pnpm tauri:dev
```

## 配置说明

### 环境变量

- `TAURI_REMOTE_URL`: 远程 React 应用的 URL
  - 如果设置：客户端会加载远程 URL
  - 如果未设置：使用本地打包的文件或 devUrl

### CSP 配置

已在 `tauri.conf.json` 中配置了宽松的 CSP，支持：
- HTTPS 和 HTTP（localhost）
- WebSocket 连接
- 外部资源加载

## 工作流程

### 开发流程

```bash
# 1. 启动本地 React 开发服务器
pnpm dev

# 2. 启动 Tauri 开发（自动使用 localhost:1420）
pnpm tauri:dev
```

### 生产流程

```bash
# 1. 部署 React 应用到远程
pnpm build
vercel --prod  # 或其他部署方式

# 2. 获取部署 URL（例如：https://your-app.vercel.app）

# 3. 构建 Tauri 客户端（指向远程 URL）
TAURI_REMOTE_URL=https://your-app.vercel.app pnpm tauri:build

# 4. 客户端安装包在 src-tauri/target/release/bundle/
```

## 优势

✅ **前端独立更新**：更新 React 应用无需重新打包客户端  
✅ **客户端体积小**：不包含前端资源  
✅ **开发体验好**：开发时仍可使用本地 React  
✅ **多版本共享**：多个客户端版本可以共享同一前端

## 注意事项

⚠️ **网络连接**：需要网络连接才能加载远程页面  
⚠️ **首次加载**：首次启动需要下载远程资源  
✅ **安全性**：确保使用 HTTPS  
✅ **CSP 已配置**：已支持远程资源加载

## 故障排查

### 无法加载远程页面

1. 检查 `TAURI_REMOTE_URL` 环境变量是否正确设置
2. 检查网络连接
3. 检查远程 URL 是否可访问
4. 查看 Tauri 日志：`log::info!` 会输出加载的 URL

### 开发环境也想测试远程

```bash
TAURI_REMOTE_URL=https://your-app.com pnpm tauri:dev
```

## 相关文件

- `src-tauri/tauri.conf.json` - Tauri 配置（CSP 设置）
- `src-tauri/src/lib.rs` - 应用入口（URL 加载逻辑）
- `docs/remote-deployment.md` - 详细文档

