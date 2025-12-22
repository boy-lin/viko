#!/usr/bin/env bash
# 自动检测和安装 FFmpeg 依赖脚本（适配 ffmpeg-next 7.1.x）

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
  printf "${BLUE}[INFO]${NC} %s\n" "$1"
}

log_ok() {
  printf "${GREEN}[OK]${NC} %s\n" "$1"
}

log_warn() {
  printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

log_error() {
  printf "${RED}[ERROR]${NC} %s\n" "$1" >&2
}

detect_os() {
  case "$(uname -s)" in
    Darwin*) echo "macos" ;;
    Linux*) echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *) echo "unknown" ;;
  esac
}

# 尝试获取 Homebrew 路径，兼容 /opt/homebrew 与 /usr/local
resolve_brew() {
  if command -v brew >/dev/null 2>&1; then
    command -v brew
    return
  fi

  for candidate in "/opt/homebrew/bin/brew" "/usr/local/bin/brew"; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
}

FFMPEG_MAJOR=""

check_pkg_config() {
  if command -v pkg-config >/dev/null 2>&1; then
    log_ok "pkg-config 已安装: $(pkg-config --version)"
    return 0
  fi

  log_warn "pkg-config 未安装"
  return 1
}

check_ffmpeg_libs() {
  local libs=(libavutil libavcodec libavformat libavfilter libswscale)
  local missing=()
  local detected_version=""

  for lib in "${libs[@]}"; do
    if pkg-config --exists "$lib" 2>/dev/null; then
      local version
      version=$(pkg-config --modversion "$lib" 2>/dev/null | head -n1)
      log_ok "$lib: $version"
      if [ -z "$detected_version" ]; then
        detected_version="$version"
      fi
    else
      log_warn "$lib 未找到"
      missing+=("$lib")
    fi
  done

  if [ -n "$detected_version" ]; then
    FFMPEG_MAJOR=$(printf "%s" "$detected_version" | cut -d. -f1)
  else
    FFMPEG_MAJOR=""
  fi

  if [ ${#missing[@]} -eq 0 ]; then
    if [ -n "$FFMPEG_MAJOR" ] && [ "$FFMPEG_MAJOR" -ge 8 ]; then
      log_warn "检测到 FFmpeg ${FFMPEG_MAJOR}.x，ffmpeg-next 7.1.x 推荐使用 FFmpeg 6.x/7.x，必要时请降级"
    fi
    return 0
  fi

  return 1
}

add_pkg_config_path() {
  local path="$1"
  if [ -d "$path" ]; then
    case ":${PKG_CONFIG_PATH-}:" in
      *":${path}:"*) ;; # 已存在
      *)
        export PKG_CONFIG_PATH="${path}${PKG_CONFIG_PATH:+:${PKG_CONFIG_PATH}}"
        log_info "已加入 PKG_CONFIG_PATH: ${path}"
        ;;
    esac
  fi
}

persist_env_var() {
  local key="$1"
  local value="$2"
  if [ -z "$value" ]; then
    log_warn "${key} 为空，未写入环境变量文件"
    return
  fi

  local shell_name
  shell_name=$(basename "${SHELL:-}")
  local profile=""

  case "$shell_name" in
    zsh) profile="$HOME/.zprofile" ;;
    bash) profile="$HOME/.bashrc" ;;
    *) profile="$HOME/.profile" ;;
  esac

  local export_line="export ${key}=\"${value}\""

  if [ -f "$profile" ] && grep -Fq "$export_line" "$profile"; then
    log_info "${key} 已存在于 ${profile}"
    return
  fi

  if printf '\n# Added by check-ffmpeg-deps\n%s\n' "$export_line" >> "$profile"; then
    log_info "已写入 ${key} 到 ${profile}，新终端会自动生效"
  else
    log_warn "写入 ${key} 到 ${profile} 失败，请手动添加: ${export_line}"
  fi
}

install_macos() {
  log_info "检测到 macOS 系统，开始安装缺失依赖"

  local brew_cmd
  brew_cmd=$(resolve_brew || true)

  if [ -z "$brew_cmd" ]; then
    log_error "未找到 Homebrew，请先安装: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
  fi

  log_info "使用 Homebrew 安装，命令路径: ${brew_cmd}"

  if ! check_pkg_config; then
    log_info "安装 pkg-config..."
    "$brew_cmd" install pkg-config
  fi

  local need_ffmpeg=false
  if ! check_ffmpeg_libs; then
    need_ffmpeg=true
  elif [ -n "$FFMPEG_MAJOR" ] && [ "$FFMPEG_MAJOR" -ge 8 ]; then
    need_ffmpeg=true
  fi

  if [ "$need_ffmpeg" = true ]; then
    log_info "$brew_cmd" install ffmpeg@7
    if ! "$brew_cmd" list --versions ffmpeg >/dev/null 2>&1; then
      "$brew_cmd" install ffmpeg@7
    else
      "$brew_cmd" upgrade ffmpeg || log_warn "升级 FFmpeg 失败，尝试保留现有版本"
    fi

    if "$brew_cmd" list --versions ffmpeg@7 >/dev/null 2>&1; then
      log_warn "检测到 ffmpeg@7，如需固定版本请设置 PKG_CONFIG_PATH:"
      log_warn "  export PKG_CONFIG_PATH=\"$("$brew_cmd" --prefix ffmpeg@7)/lib/pkgconfig:\$PKG_CONFIG_PATH\""
    fi
    if "$brew_cmd" list --versions ffmpeg@6 >/dev/null 2>&1; then
      log_warn "检测到 ffmpeg@6，可使用:"
      log_warn "  export PKG_CONFIG_PATH=\"$("$brew_cmd" --prefix ffmpeg@6)/lib/pkgconfig:\$PKG_CONFIG_PATH\""
    fi
  fi

  add_pkg_config_path "$("$brew_cmd" --prefix)/opt/ffmpeg/lib/pkgconfig"
  add_pkg_config_path "$("$brew_cmd" --prefix)/lib/pkgconfig"
  if "$brew_cmd" list --versions ffmpeg@7 >/dev/null 2>&1; then
    add_pkg_config_path "$("$brew_cmd" --prefix ffmpeg@7)/lib/pkgconfig"
  fi
  if "$brew_cmd" list --versions ffmpeg@6 >/dev/null 2>&1; then
    add_pkg_config_path "$("$brew_cmd" --prefix ffmpeg@6)/lib/pkgconfig"
  fi
  if [ -n "${PKG_CONFIG_PATH-}" ]; then
    log_info "已为脚本会话设置 PKG_CONFIG_PATH=${PKG_CONFIG_PATH}"
    printf "如需在当前终端复用上述路径，请执行:\n  export PKG_CONFIG_PATH=\"%s\"\n" "$PKG_CONFIG_PATH"
    persist_env_var "PKG_CONFIG_PATH" "$PKG_CONFIG_PATH"
  fi

  log_ok "macOS 依赖处理完成"
  log_warn "若仍遇到 libavresample 相关报错，可设置: export LIBAVRESAMPLE_NO_PKG_CONFIG=1"
}

install_linux() {
  log_info "检测到 Linux 系统，开始安装缺失依赖"

  local pkg_manager=""
  local update_cmd=()
  local install_cmd=()

  if command -v apt-get >/dev/null 2>&1; then
    pkg_manager="apt-get"
    update_cmd=(sudo apt-get update)
    install_cmd=(sudo apt-get install -y)
  elif command -v dnf >/dev/null 2>&1; then
    pkg_manager="dnf"
    update_cmd=(sudo dnf check-update)
    install_cmd=(sudo dnf install -y)
  elif command -v yum >/dev/null 2>&1; then
    pkg_manager="yum"
    update_cmd=(sudo yum check-update)
    install_cmd=(sudo yum install -y)
  elif command -v pacman >/dev/null 2>&1; then
    pkg_manager="pacman"
    update_cmd=(sudo pacman -Sy)
    install_cmd=(sudo pacman -S --noconfirm)
  else
    log_error "未找到支持的包管理器 (apt-get/dnf/yum/pacman)"
    exit 1
  fi

  log_info "使用 ${pkg_manager} 安装依赖"
  if ! "${update_cmd[@]}"; then
    log_warn "更新包列表失败，尝试继续安装"
  fi

  if ! check_pkg_config; then
    log_info "安装 pkg-config..."
    "${install_cmd[@]}" pkg-config
  fi

  if ! check_ffmpeg_libs; then
    log_info "安装 FFmpeg 开发库..."
    case "$pkg_manager" in
      apt-get)
        "${install_cmd[@]}" libavutil-dev libavcodec-dev libavformat-dev libavfilter-dev libswscale-dev
        ;;
      yum|dnf)
        "${install_cmd[@]}" ffmpeg-devel
        ;;
      pacman)
        "${install_cmd[@]}" ffmpeg
        ;;
    esac
  fi

  log_ok "Linux 依赖处理完成"
}

install_windows() {
  log_warn "检测到 Windows 系统"
  log_warn "请手动安装 FFmpeg 及 pkg-config，可选方案："
  printf "  1) vcpkg: vcpkg install ffmpeg\n"
  printf "  2) MSYS2: pacman -S mingw-w64-x86_64-ffmpeg\n"
  printf "  3) 预编译包: https://www.gyan.dev/ffmpeg/builds/\n\n"
  printf "安装后请设置 PKG_CONFIG_PATH 指向 FFmpeg 的 lib/pkgconfig 目录。\n"
  exit 1
}

main() {
  log_info "开始检测 FFmpeg 依赖..."
  printf "\n"

  local os
  os=$(detect_os)

  local need_pkg=false
  local need_ffmpeg=false

  if ! check_pkg_config; then
    need_pkg=true
    need_ffmpeg=true # 没有 pkg-config 无法探测，默认一起安装
  elif ! check_ffmpeg_libs; then
    need_ffmpeg=true
  fi

  printf "\n"

  if [ "$need_pkg" = false ] && [ "$need_ffmpeg" = false ]; then
    log_ok "所有依赖已满足！"
    exit 0
  fi

  case "$os" in
    macos) install_macos ;;
    linux) install_linux ;;
    windows) install_windows ;;
    *)
      log_error "不支持的操作系统: $os"
      exit 1
      ;;
  esac

  printf "\n"
  log_info "验证安装..."

  if check_pkg_config && check_ffmpeg_libs; then
    log_ok "所有依赖安装成功！"
  else
    log_error "依赖安装仍有缺失，请手动检查（可确认 PKG_CONFIG_PATH 是否包含 FFmpeg 的 lib/pkgconfig）"
    exit 1
  fi
}

main "$@"
