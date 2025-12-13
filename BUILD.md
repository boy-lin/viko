# 打包说明

## 开发模式

```bash
npm run tauri:dev
# 或
pnpm tauri:dev
```

## 打包命令

### 默认打包（当前平台）

```bash
npm run tauri:build
# 或
pnpm tauri:build
```

### 指定平台打包

#### macOS

```bash
# Apple Silicon (M1/M2/M3)
npm run build:mac:arm

# Intel Mac
npm run build:mac:intel

# 自动选择（默认 Apple Silicon）
npm run build:mac
```

#### Windows

```bash
npm run build:win
```

#### Linux

```bash
npm run build:linux
```

### 全平台打包

```bash
# 打包所有平台（macOS/Windows/Linux）
npm run build:all

# 打包 macOS 所有架构（ARM + Intel）
npm run build:all:mac
```

## 打包输出位置

打包完成后，安装包会生成在以下目录：

- **macOS**: `src-tauri/target/release/bundle/macos/`
  - `.app` 应用包
  - `.dmg` 安装镜像
  
- **Windows**: `src-tauri/target/release/bundle/msi/`
  - `.msi` 安装程序
  
- **Linux**: `src-tauri/target/release/bundle/`
  - `.deb` / `.AppImage` / `.rpm` 等

## 注意事项

1. **跨平台打包**：在 macOS 上可以打包 macOS 和 Linux，但无法直接打包 Windows（需要 Windows 环境或使用 CI/CD）
2. **首次打包**：会下载 Rust 工具链和依赖，耗时较长
3. **平台要求**：
   - macOS 打包需要 Xcode Command Line Tools
   - Windows 打包需要 Visual Studio Build Tools
   - Linux 打包需要基础开发工具

## ⚠️ 在 macOS 上打包 Windows 应用

**Docker 方案不可行**，因为：
- Docker Desktop for Mac 不支持 Windows 容器
- Tauri 需要 Windows SDK 和 MSVC 工具链
- Tauri 不支持交叉编译到 Windows

**推荐方案：使用 GitHub Actions（已配置）**

详细说明请查看 [BUILD_WINDOWS.md](./BUILD_WINDOWS.md)

## CI/CD 建议

对于全平台打包，建议使用 GitHub Actions 或其他 CI/CD 服务：

- macOS: 使用 `macos-latest` runner
- Windows: 使用 `windows-latest` runner  
- Linux: 使用 `ubuntu-latest` runner

**已配置 GitHub Actions 工作流：**
- `.github/workflows/build.yml` - 自动打包所有平台

**使用方法：**
```bash
# 创建 tag 触发构建
git tag v1.0.0
git push origin v1.0.0

# 或手动触发：GitHub 仓库 -> Actions -> Build Tauri App -> Run workflow
```

