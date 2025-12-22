#!/usr/bin/env bash
# 获取 FFmpeg pkg-config 路径的辅助脚本

set -euo pipefail

# 查找 FFmpeg pkg-config 路径
find_ffmpeg_pkgconfig() {
  local paths=()
  
  # 1. 检查 HOMEBREW_PREFIX
  if [ -n "${HOMEBREW_PREFIX:-}" ]; then
    if [ -d "${HOMEBREW_PREFIX}/lib/pkgconfig" ]; then
      paths+=("${HOMEBREW_PREFIX}/lib/pkgconfig")
    fi
    if [ -d "${HOMEBREW_PREFIX}/opt/ffmpeg/lib/pkgconfig" ]; then
      paths+=("${HOMEBREW_PREFIX}/opt/ffmpeg/lib/pkgconfig")
    fi
  fi
  
  # 2. 检查默认 Homebrew 路径
  for base in "/opt/homebrew" "/usr/local"; do
    if [ -d "${base}/lib/pkgconfig" ]; then
      paths+=("${base}/lib/pkgconfig")
    fi
    if [ -d "${base}/opt/ffmpeg/lib/pkgconfig" ]; then
      paths+=("${base}/opt/ffmpeg/lib/pkgconfig")
    fi
  done
  
  # 3. 查找 FFmpeg Cellar 路径（版本化安装）
  for cellar_base in "/opt/homebrew/Cellar/ffmpeg@7" "/opt/homebrew/Cellar/ffmpeg" \
                     "/usr/local/Cellar/ffmpeg@7" "/usr/local/Cellar/ffmpeg"; do
    if [ -d "$cellar_base" ]; then
      for version_dir in "$cellar_base"/*; do
        if [ -d "$version_dir/lib/pkgconfig" ]; then
          paths+=("$version_dir/lib/pkgconfig")
        fi
      done
    fi
  done
  
  # 4. 去重并输出
  if [ ${#paths[@]} -gt 0 ]; then
    printf "%s\n" "${paths[@]}" | sort -u | tr '\n' ':'
  fi
}

# 获取路径
PKG_CONFIG_PATH=$(find_ffmpeg_pkgconfig)

if [ -n "$PKG_CONFIG_PATH" ]; then
  # 移除末尾的冒号
  PKG_CONFIG_PATH="${PKG_CONFIG_PATH%:}"
  echo "$PKG_CONFIG_PATH"
else
  echo ""
fi

