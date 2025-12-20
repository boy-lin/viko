#!/bin/bash
# 自动检测和安装 FFmpeg 依赖脚本

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检测操作系统
detect_os() {
    case "$(uname -s)" in
        Darwin*)
            echo "macos"
            ;;
        Linux*)
            echo "linux"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# 检测 pkg-config
check_pkg_config() {
    if command -v pkg-config >/dev/null 2>&1; then
        echo_info "pkg-config 已安装: $(pkg-config --version)"
        return 0
    else
        echo_warn "pkg-config 未安装"
        return 1
    fi
}

# 检测 FFmpeg 库
check_ffmpeg_libs() {
    local missing_libs=()
    
    if pkg-config --exists libavutil 2>/dev/null; then
        echo_info "libavutil: $(pkg-config --modversion libavutil)"
    else
        echo_warn "libavutil 未找到"
        missing_libs+=("libavutil")
    fi
    
    if pkg-config --exists libavcodec 2>/dev/null; then
        echo_info "libavcodec: $(pkg-config --modversion libavcodec)"
    else
        echo_warn "libavcodec 未找到"
        missing_libs+=("libavcodec")
    fi
    
    if pkg-config --exists libavformat 2>/dev/null; then
        echo_info "libavformat: $(pkg-config --modversion libavformat)"
    else
        echo_warn "libavformat 未找到"
        missing_libs+=("libavformat")
    fi
    
    if pkg-config --exists libavfilter 2>/dev/null; then
        echo_info "libavfilter: $(pkg-config --modversion libavfilter)"
    else
        echo_warn "libavfilter 未找到"
        missing_libs+=("libavfilter")
    fi
    
    if pkg-config --exists libswscale 2>/dev/null; then
        echo_info "libswscale: $(pkg-config --modversion libswscale)"
    else
        echo_warn "libswscale 未找到"
        missing_libs+=("libswscale")
    fi
    
    if [ ${#missing_libs[@]} -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# 检测当前架构
detect_arch() {
    local arch=$(uname -m)
    local proc_translated=$(sysctl -n sysctl.proc_translated 2>/dev/null || echo "0")
    
    if [ "$proc_translated" = "1" ]; then
        echo "rosetta"  # 运行在 Rosetta 2 下
    elif [ "$arch" = "arm64" ]; then
        echo "arm64"    # 原生 ARM64
    else
        echo "x86_64"   # 原生 x86_64
    fi
}

# 获取正确的 brew 命令
get_brew_cmd() {
    local arch=$(detect_arch)
    
    if [ "$arch" = "rosetta" ]; then
        # 在 Rosetta 2 下，使用 arch -arm64 运行 brew
        echo "arch -arm64 brew"
    else
        echo "brew"
    fi
}

# macOS 安装
install_macos() {
    echo_info "检测到 macOS 系统"
    
    # 检测架构
    local arch=$(detect_arch)
    if [ "$arch" = "rosetta" ]; then
        echo_warn "检测到运行在 Rosetta 2 环境下，将使用 ARM64 架构的 Homebrew"
    fi
    
    # 获取正确的 brew 命令
    local brew_cmd=$(get_brew_cmd)
    
    # 检测 Homebrew
    if ! command -v brew >/dev/null 2>&1; then
        echo_error "未找到 Homebrew，请先安装 Homebrew:"
        if [ "$arch" = "rosetta" ]; then
            echo "  注意：在 Rosetta 2 环境下，请使用 ARM64 架构安装:"
            echo "  arch -arm64 /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        else
            echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        fi
        exit 1
    fi
    
    # 验证 brew 命令是否可用
    if ! eval "$brew_cmd --version" >/dev/null 2>&1; then
        echo_error "Homebrew 命令执行失败"
        if [ "$arch" = "rosetta" ]; then
            echo_error "请确保已安装 ARM64 版本的 Homebrew (/opt/homebrew)"
            echo_error "如果需要在 x86_64 下运行，请安装到 /usr/local"
        fi
        exit 1
    fi
    
    echo_info "使用 Homebrew 安装依赖 (命令: $brew_cmd)..."
    
    # 安装 pkg-config
    if ! check_pkg_config; then
        echo_info "安装 pkg-config..."
        eval "$brew_cmd install pkg-config"
        if [ $? -ne 0 ]; then
            echo_error "安装 pkg-config 失败"
            exit 1
        fi
    fi
    
    # 安装 FFmpeg
    if ! check_ffmpeg_libs; then
        echo_info "安装 FFmpeg..."
        echo_info "ffmpeg-next 8.0.0 支持 FFmpeg 8.x，安装最新版本..."
        eval "$brew_cmd install ffmpeg"
        if [ $? -ne 0 ]; then
            echo_error "安装 FFmpeg 失败"
            exit 1
        fi
    else
        # 检查 FFmpeg 版本
        local ffmpeg_version=$(pkg-config --modversion libavutil 2>/dev/null | cut -d. -f1)
        if [ "$ffmpeg_version" = "8" ]; then
            echo_info "检测到 FFmpeg 8.x，与 ffmpeg-next 8.0.0 兼容"
        elif [ "$ffmpeg_version" = "6" ] || [ "$ffmpeg_version" = "7" ]; then
            echo_info "检测到 FFmpeg ${ffmpeg_version}.x，与 ffmpeg-next 8.0.0 兼容"
        fi
    fi
    
    echo_info "macOS 依赖安装完成"
    
    # 提示设置环境变量（如果需要）
    echo_info ""
    echo_info "注意：如果编译时遇到 libavresample 错误，请设置环境变量:"
    echo_info "  export LIBAVRESAMPLE_NO_PKG_CONFIG=1"
}

# Linux 安装
install_linux() {
    echo_info "检测到 Linux 系统"
    
    # 检测包管理器
    if command -v apt-get >/dev/null 2>&1; then
        echo_info "使用 apt-get 安装依赖..."
        PKG_MANAGER="apt-get"
        UPDATE_CMD="sudo apt-get update"
        INSTALL_CMD="sudo apt-get install -y"
    elif command -v yum >/dev/null 2>&1; then
        echo_info "使用 yum 安装依赖..."
        PKG_MANAGER="yum"
        UPDATE_CMD="sudo yum check-update || true"
        INSTALL_CMD="sudo yum install -y"
    elif command -v dnf >/dev/null 2>&1; then
        echo_info "使用 dnf 安装依赖..."
        PKG_MANAGER="dnf"
        UPDATE_CMD="sudo dnf check-update || true"
        INSTALL_CMD="sudo dnf install -y"
    elif command -v pacman >/dev/null 2>&1; then
        echo_info "使用 pacman 安装依赖..."
        PKG_MANAGER="pacman"
        UPDATE_CMD="sudo pacman -Sy"
        INSTALL_CMD="sudo pacman -S --noconfirm"
    else
        echo_error "未找到支持的包管理器 (apt-get/yum/dnf/pacman)"
        exit 1
    fi
    
    # 更新包列表
    echo_info "更新包列表..."
    eval "$UPDATE_CMD" || true
    
    # 安装 pkg-config
    if ! check_pkg_config; then
        echo_info "安装 pkg-config..."
        eval "$INSTALL_CMD pkg-config"
    fi
    
    # 安装 FFmpeg 开发库
    if ! check_ffmpeg_libs; then
        echo_info "安装 FFmpeg 开发库..."
        case "$PKG_MANAGER" in
            apt-get)
                eval "$INSTALL_CMD libavutil-dev libavcodec-dev libavformat-dev libavfilter-dev libswscale-dev"
                ;;
            yum|dnf)
                eval "$INSTALL_CMD ffmpeg-devel"
                ;;
            pacman)
                eval "$INSTALL_CMD ffmpeg"
                ;;
        esac
    fi
    
    echo_info "Linux 依赖安装完成"
}

# Windows 安装
install_windows() {
    echo_warn "检测到 Windows 系统"
    echo_warn "Windows 平台需要手动安装 FFmpeg"
    echo ""
    echo "请选择以下方式之一："
    echo "1. 使用 vcpkg:"
    echo "   vcpkg install ffmpeg"
    echo ""
    echo "2. 使用 MSYS2:"
    echo "   pacman -S mingw-w64-x86_64-ffmpeg"
    echo ""
    echo "3. 下载预编译版本:"
    echo "   https://www.gyan.dev/ffmpeg/builds/"
    echo ""
    echo "安装后，请设置环境变量:"
    echo "  PKG_CONFIG_PATH=<ffmpeg安装路径>/lib/pkgconfig"
    exit 1
}

# 主函数
main() {
    echo_info "开始检测 FFmpeg 依赖..."
    echo ""
    
    local os=$(detect_os)
    
    # 检查 pkg-config
    local need_pkg_config=false
    if ! check_pkg_config; then
        need_pkg_config=true
    fi
    
    # 检查 FFmpeg 库
    local need_ffmpeg=false
    if ! check_pkg_config; then
        echo_warn "无法检测 FFmpeg 库（pkg-config 未安装）"
        need_ffmpeg=true
    elif ! check_ffmpeg_libs; then
        need_ffmpeg=true
    fi
    
    echo ""
    
    # 如果都安装了，直接返回
    if [ "$need_pkg_config" = false ] && [ "$need_ffmpeg" = false ]; then
        echo_info "所有依赖已安装！"
        return 0
    fi
    
    # 根据操作系统安装
    case "$os" in
        macos)
            install_macos
            ;;
        linux)
            install_linux
            ;;
        windows)
            install_windows
            ;;
        *)
            echo_error "不支持的操作系统: $os"
            exit 1
            ;;
    esac
    
    echo ""
    echo_info "验证安装..."
    
    # 再次检查
    if check_pkg_config && check_ffmpeg_libs; then
        echo_info "✓ 所有依赖安装成功！"
    else
        echo_error "✗ 依赖安装失败，请手动检查"
        exit 1
    fi
}

# 运行主函数
main "$@"

