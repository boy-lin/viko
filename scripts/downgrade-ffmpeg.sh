#!/bin/bash
# 降级 FFmpeg 到 6.x 版本以确保与 ffmpeg-next 兼容

set -e

# 检测架构
detect_arch() {
    local arch=$(uname -m)
    local proc_translated=$(sysctl -n sysctl.proc_translated 2>/dev/null || echo "0")
    
    if [ "$proc_translated" = "1" ]; then
        echo "rosetta"
    elif [ "$arch" = "arm64" ]; then
        echo "arm64"
    else
        echo "x86_64"
    fi
}

echo "正在降级 FFmpeg 到 6.x 版本..."

# 检测架构并获取正确的 brew 命令
arch=$(detect_arch)
if [ "$arch" = "rosetta" ]; then
    brew_cmd="arch -arm64 brew"
    echo "检测到 Rosetta 2 环境，使用 ARM64 Homebrew"
else
    brew_cmd="brew"
fi

# 卸载当前版本
echo "卸载当前 FFmpeg..."
eval "$brew_cmd uninstall ffmpeg" || true

# 安装 FFmpeg 6.x
echo "安装 FFmpeg 6.x..."
eval "$brew_cmd install ffmpeg@6"

# 链接 FFmpeg 6.x
echo "链接 FFmpeg 6.x..."
eval "$brew_cmd link ffmpeg@6 --force"

echo ""
echo "✓ FFmpeg 已降级到 6.x 版本"
echo "现在可以尝试编译: cargo build"
