# FFmpeg 依赖检测和安装脚本

这些脚本用于自动检测和安装 FFmpeg 开发依赖（pkg-config 和 FFmpeg 库）。

## 使用方法

### macOS / Linux

```bash
# 直接运行脚本
./scripts/check-ffmpeg-deps.sh

# 或使用 npm 命令
pnpm check:deps
```

### Windows

```powershell
# 直接运行脚本
powershell -ExecutionPolicy Bypass -File scripts/check-ffmpeg-deps.ps1

# 或使用 npm 命令
pnpm check:deps:win
```

## 功能说明

### 检测内容

脚本会自动检测以下依赖：

1. **pkg-config**: 用于查找和配置库的工具
2. **FFmpeg 库**:
   - libavutil
   - libavcodec
   - libavformat
   - libavfilter
   - libswscale

### 自动安装

根据操作系统，脚本会自动使用相应的包管理器安装缺失的依赖：

- **macOS**: 使用 Homebrew (`brew install ffmpeg`)
- **Linux**:
  - Debian/Ubuntu: `apt-get install libavutil-dev libavcodec-dev ...`
  - RHEL/CentOS: `yum install ffmpeg-devel`
  - Fedora: `dnf install ffmpeg-devel`
  - Arch: `pacman -S ffmpeg`
- **Windows**: 提供安装指导（Chocolatey/vcpkg/手动安装）

## 手动安装

如果自动安装失败，可以手动安装：

### macOS

```bash
brew install pkg-config ffmpeg
```

### Linux (Debian/Ubuntu)

```bash
sudo apt-get update
sudo apt-get install -y pkg-config libavutil-dev libavcodec-dev libavformat-dev libavfilter-dev libswscale-dev
```

### Linux (RHEL/CentOS/Fedora)

```bash
# RHEL/CentOS
sudo yum install -y pkg-config ffmpeg-devel

# Fedora
sudo dnf install -y pkg-config ffmpeg-devel
```

### Linux (Arch)

```bash
sudo pacman -S pkg-config ffmpeg
```

### Windows

#### 使用 Chocolatey

```powershell
# 安装 Chocolatey（如果未安装）
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 安装 FFmpeg
choco install ffmpeg -y
```

#### 使用 vcpkg

```powershell
# 安装 vcpkg（如果未安装）
git clone https://github.com/Microsoft/vcpkg.git
.\vcpkg\bootstrap-vcpkg.bat

# 安装 FFmpeg
.\vcpkg\vcpkg install ffmpeg:x64-windows
#  C:\Users\admin\vcpkg\vcpkg.exe install ffmpeg[x264]:x64-windows

# 设置环境变量
$env:PKG_CONFIG_PATH = "<vcpkg安装路径>\installed\x64-windows\lib\pkgconfig"
```

#### 手动下载

1. 访问 https://www.gyan.dev/ffmpeg/builds/
2. 下载 FFmpeg 预编译版本
3. 解压并设置环境变量：
   - `PKG_CONFIG_PATH=<FFmpeg路径>\lib\pkgconfig`
   - `PATH=<FFmpeg路径>\bin`

## 验证安装

安装完成后，可以运行以下命令验证：

```bash
# 检查 pkg-config
pkg-config --version

# 检查 FFmpeg 库
pkg-config --modversion libavutil
pkg-config --modversion libavcodec
pkg-config --modversion libavformat
```

## 故障排除

### macOS

- **Homebrew 未安装**: 脚本会提示安装 Homebrew
- **权限问题**: 确保有管理员权限执行 `brew install`

### Linux

- **包管理器未找到**: 确保系统使用支持的包管理器
- **权限问题**: 脚本需要 `sudo` 权限，确保用户有 sudo 权限
- **包名不同**: 某些发行版可能使用不同的包名，请参考发行版文档

### Windows

- **PowerShell 执行策略**: 如果脚本无法运行，执行：
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
- **环境变量**: 安装后需要设置 `PKG_CONFIG_PATH` 环境变量
- **路径问题**: 确保 FFmpeg 的 `bin` 目录在 `PATH` 中

## 注意事项

1. **编译时依赖**: `ffmpeg-next` 需要在编译时链接 FFmpeg 库，因此必须在编译前安装
2. **版本兼容性**:
   - `ffmpeg-next` 8.0.0 支持 FFmpeg 8.x（推荐）
   - 也兼容 FFmpeg 6.x 和 7.x
   - 建议使用 FFmpeg 8.x 以获得最新功能和性能
3. **动态库路径**: 如果使用自定义 FFmpeg 路径，需要设置相应的环境变量

## FFmpeg 版本兼容性修复

**注意**: 即使运行了修复脚本，FFmpeg 8.x 仍可能与 `ffmpeg-next` 6.1.0 不完全兼容。建议降级到 FFmpeg 6.x：

```bash
# macOS
brew uninstall ffmpeg
brew install ffmpeg@6
brew link ffmpeg@6
```

# FFmpeg Development Libraries

```bash
# Linux (Debian/Ubuntu)
sudo apt update
sudo apt install clang libavcodec-dev libavformat-dev libavutil-dev libavfilter-dev libavdevice-dev libasound2-dev pkg-config

# macOS (Homebrew)
brew install pkg-config ffmpeg
# 查看 ffmpeg@7 的安装目录
brew --prefix ffmpeg@7
# /opt/homebrew/opt/ffmpeg@7

# Windows (vcpkg)
vcpkg install ffmpeg --triplet x64-windows
```
