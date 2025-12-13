# FigureX - 视频转码工具

基于 Tauri + React + TypeScript 构建的跨平台视频转码应用。

## 环境要求

### 包管理器

本项目使用 **pnpm** 作为包管理器，要求版本 **10.11.1**。

#### 安装和设置

**方式一：使用 Corepack（推荐）**

Corepack 是 Node.js 内置的包管理器管理器，会自动使用 `package.json` 中指定的 pnpm 版本。

```bash
# 启用 Corepack（Node.js 16.9+ 内置）
corepack enable

# 自动使用 package.json 中指定的 pnpm 版本
pnpm install
```

**方式二：手动安装 pnpm**

```bash
# 使用 npm 安装
npm install -g pnpm@10.11.1

# 或使用 Homebrew (macOS)
brew install pnpm@10.11.1

# 验证版本
pnpm --version  # 应该显示 10.11.1
```

### 其他依赖

- **Node.js**: 20+
- **Rust**: stable (通过 rustup 安装)
- **系统依赖**:
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools
  - Linux: libwebkit2gtk-4.1-dev, libssl-dev 等

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm tauri:dev

# 构建前端
pnpm build
```

## 打包

详细打包说明请查看 [BUILD.md](./BUILD.md)

```bash
# 打包当前平台
pnpm tauri:build

# 打包指定平台
pnpm build:mac      # macOS (Apple Silicon)
pnpm build:win      # Windows
pnpm build:linux    # Linux
```

## 推荐 IDE 设置

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
