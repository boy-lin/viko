# 在 macOS 上打包 Windows 应用

## ❌ Docker 方案的限制

**在 macOS 上通过 Docker 打包 Windows 应用不可行**，原因：

1. **Docker Desktop for Mac 不支持 Windows 容器**
   - macOS 上的 Docker 只能运行 Linux 容器
   - Windows 容器需要 Windows 主机或 Hyper-V

2. **Tauri 打包 Windows 需要 Windows 环境**
   - 需要 Windows SDK
   - 需要 MSVC 工具链（Visual Studio Build Tools）
   - 需要 Windows 特定的构建工具

3. **Tauri 不支持交叉编译到 Windows**
   - 必须在 Windows 环境中编译
   - 无法从 macOS/Linux 直接交叉编译

## ✅ 推荐方案

### 方案 1: GitHub Actions（推荐）

使用 GitHub Actions 在云端自动打包所有平台，**完全免费**。

**使用方法：**

1. 将代码推送到 GitHub
2. 创建 Release Tag（如 `v1.0.0`）
3. GitHub Actions 会自动触发构建
4. 在 Actions 页面下载构建产物

**已配置的工作流：**
- `.github/workflows/build.yml` - 自动打包所有平台

**触发方式：**
```bash
# 创建 tag 触发构建
git tag v1.0.0
git push origin v1.0.0

# 或手动触发
# 在 GitHub 仓库页面 -> Actions -> Build Tauri App -> Run workflow
```

### 方案 2: 使用 Windows 虚拟机

在 macOS 上运行 Windows 虚拟机（Parallels Desktop、VMware Fusion、UTM 等）：

1. 安装 Windows 10/11 虚拟机
2. 在虚拟机中安装：
   - Node.js
   - Rust
   - Visual Studio Build Tools
3. 克隆项目并运行 `npm run build:win`

### 方案 3: 使用云 Windows 实例

使用云服务商的 Windows 实例：

- **AWS EC2** - Windows Server 实例
- **Azure** - Windows 虚拟机
- **Google Cloud** - Windows Server 实例

### 方案 4: 使用本地 Windows 机器

如果有 Windows 电脑或双系统：

```bash
# 在 Windows 上
git clone <your-repo>
cd figurex
npm install
npm run build:win
```

## 🚀 快速开始（GitHub Actions）

1. **确保已配置 GitHub Actions 工作流**
   ```bash
   # 工作流文件已创建在 .github/workflows/build.yml
   ```

2. **推送代码到 GitHub**
   ```bash
   git add .
   git commit -m "Add build workflow"
   git push origin main
   ```

3. **创建 Release Tag 触发构建**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

4. **查看构建进度**
   - 访问 `https://github.com/<your-username>/<repo>/actions`
   - 等待构建完成
   - 下载构建产物

## 📦 构建产物位置

构建完成后，可以在 GitHub Actions 的 Artifacts 中下载：

- `macos-latest--target aarch64-apple-darwin` - macOS Apple Silicon
- `macos-latest--target x86_64-apple-darwin` - macOS Intel
- `windows-latest--target x86_64-pc-windows-msvc` - Windows
- `ubuntu-latest--target x86_64-unknown-linux-gnu` - Linux

## 💡 最佳实践

1. **使用 GitHub Actions** - 最简单、免费、自动化
2. **版本管理** - 使用语义化版本（Semantic Versioning）
3. **自动化发布** - 配置自动创建 GitHub Release
4. **代码签名** - 生产环境建议配置代码签名

## 🔧 本地开发建议

对于本地开发，建议：

- **macOS**: 使用 `npm run build:mac` 打包 macOS 应用
- **Linux**: 使用 `npm run build:linux` 打包 Linux 应用
- **Windows**: 使用 GitHub Actions 或 Windows 虚拟机

