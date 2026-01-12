# Tauri 客户端加载远程 React 页面配置指南

## 概述

本方案允许 Tauri 客户端加载部署在远程服务器上的 React 页面，而不是将前端资源打包到客户端中。

## 架构

```
┌─────────────────┐         ┌──────────────────┐
│  Tauri 客户端   │ ──────> │  远程 React 应用  │
│  (Rust 后端)    │  HTTP   │  (Vercel/Netlify) │
└─────────────────┘         └──────────────────┘
```

## 配置方法

### 方法 1：使用环境变量（推荐）

#### 开发环境（使用本地 React）

```bash
# 不设置环境变量，或设置为本地地址
# TAURI_REMOTE_URL=http://localhost:1420

pnpm tauri:dev
```

#### 生产环境（使用远程 React）

```bash
# 设置远程 URL
export TAURI_REMOTE_URL=https://your-react-app.vercel.app

# 构建客户端（不包含前端资源）
pnpm tauri:build
```

### 方法 2：修改配置文件

编辑 `src-tauri/tauri.conf.json`，在 `app.windows` 中直接设置 `url`：

```json
{
  "app": {
    "windows": [
      {
        "url": "https://your-react-app.com"
      }
    ]
  }
}
```

## 部署步骤

### 1. 部署 React 应用到远程服务器

#### 选项 A：Vercel

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel

# 或使用 GitHub 集成自动部署
```

#### 选项 B：Netlify

```bash
# 安装 Netlify CLI
npm i -g netlify-cli

# 部署
netlify deploy --prod
```

#### 选项 C：自建服务器

```bash
# 构建 React 应用
pnpm build

# 将 dist 目录内容上传到服务器
# 配置 Nginx/Apache 支持 SPA 路由
```

### 2. 配置 Tauri 客户端

#### 开发环境

保持默认配置，使用本地 React：

```bash
pnpm tauri:dev
```

#### 生产环境

设置环境变量并构建：

```bash
# 方式 1：临时设置
TAURI_REMOTE_URL=https://your-react-app.vercel.app pnpm tauri:build

# 方式 2：创建 .env 文件
echo "TAURI_REMOTE_URL=https://your-react-app.vercel.app" > .env
pnpm tauri:build

# 方式 3：在 CI/CD 中设置
# GitHub Actions / GitLab CI 等
```

### 3. 更新 CSP（内容安全策略）

已自动配置在 `tauri.conf.json` 中，支持：
- HTTPS 和 HTTP（localhost）
- WebSocket 连接
- 外部资源加载

## 优势

1. ✅ **前端独立更新**：更新 React 应用无需重新打包客户端
2. ✅ **客户端体积小**：不包含前端资源，体积更小
3. ✅ **开发体验好**：开发时仍可使用本地 React
4. ✅ **多客户端共享**：多个客户端版本可以共享同一前端

## 注意事项

### 1. 网络连接

- ⚠️ **离线不可用**：需要网络连接才能加载远程页面
- 💡 **解决方案**：可以实现 Service Worker 缓存或提供离线模式

### 2. 安全性

- ✅ **使用 HTTPS**：确保远程 URL 使用 HTTPS
- ✅ **CSP 配置**：已配置内容安全策略
- ⚠️ **资源验证**：考虑实现资源完整性验证（可选）

### 3. 性能

- ⚠️ **首次加载**：首次启动需要下载远程资源
- 💡 **优化建议**：
  - 使用 CDN 加速
  - 启用 HTTP/2
  - 实现资源缓存

### 4. 开发/生产环境切换

```bash
# 开发：使用本地
pnpm tauri:dev

# 生产：使用远程
TAURI_REMOTE_URL=https://your-app.com pnpm tauri:build
```

## 故障排查

### 问题 1：无法加载远程页面

**检查项**：
- [ ] 远程 URL 是否正确
- [ ] 网络连接是否正常
- [ ] CSP 配置是否允许该域名
- [ ] 远程服务器是否支持 CORS

### 问题 2：Tauri API 调用失败

**原因**：远程页面和 Tauri 客户端不在同一域

**解决方案**：确保 `bridge.isTauriEvn()` 检查正常工作，代码已处理此情况

### 问题 3：开发环境也想测试远程

```bash
# 临时设置环境变量
TAURI_REMOTE_URL=https://your-app.com pnpm tauri:dev
```

## 示例配置

### Vercel 部署

```bash
# 1. 部署 React 应用
vercel

# 2. 获取部署 URL（例如：https://your-app.vercel.app）

# 3. 构建 Tauri 客户端
TAURI_REMOTE_URL=https://your-app.vercel.app pnpm tauri:build
```

### Netlify 部署

```bash
# 1. 部署 React 应用
netlify deploy --prod

# 2. 获取部署 URL（例如：https://your-app.netlify.app）

# 3. 构建 Tauri 客户端
TAURI_REMOTE_URL=https://your-app.netlify.app pnpm tauri:build
```

## 相关文件

- `src-tauri/tauri.conf.json` - Tauri 配置文件
- `src-tauri/src/lib.rs` - 应用入口，包含 URL 加载逻辑
- `.env.example` - 环境变量示例

