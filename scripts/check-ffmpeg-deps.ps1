$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-ErrMsg {
  param([string]$Message)
  Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Get-PkgConfigPath {
  try {
    $pkg = Get-Command pkgconf -ErrorAction SilentlyContinue
    if ($pkg) { return $pkg.Source }
    $pkg = Get-Command pkg-config -ErrorAction SilentlyContinue
    if ($pkg) { return $pkg.Source }
  } catch {
    # keep searching
  }

  $vcpkgRoot = Get-VcpkgRoot
  if ($null -ne $vcpkgRoot) {
    $pkgConfigPaths = @(
      (Join-Path $vcpkgRoot "installed\x64-windows\tools\pkgconf\pkgconf.exe"),
      (Join-Path $vcpkgRoot "installed\x64-windows\tools\pkgconf\pkg-config.exe"),
      (Join-Path $vcpkgRoot "installed\x64-windows\tools\pkgconf\bin\pkgconf.exe"),
      (Join-Path $vcpkgRoot "installed\x64-windows\tools\pkgconf\bin\pkg-config.exe"),
      (Join-Path $vcpkgRoot "installed\x64-windows\tools\pkg-config\pkg-config.exe"),
      (Join-Path $vcpkgRoot "installed\x64-windows\tools\pkg-config\bin\pkg-config.exe")
    )

    foreach ($path in $pkgConfigPaths) {
      if (Test-Path $path) {
        return $path
      }
    }
  }

  return $null
}

function Test-PkgConfig {
  $pkgConfigPath = Get-PkgConfigPath
  if ($null -eq $pkgConfigPath) {
    Write-Warn "pkgconf/pkg-config 未安装或不可用"
    return $false
  }

  try {
    $version = & $pkgConfigPath --version
    Write-Info "pkgconf/pkg-config 已安装: $version (路径: $pkgConfigPath)"
    return $true
  } catch {
    Write-Warn "pkgconf/pkg-config 可能未正确安装"
    return $false
  }
}

function Test-FFmpegLibs {
  $pkgConfigPath = Get-PkgConfigPath
  if ($null -eq $pkgConfigPath) {
    Write-Warn "未找到 pkgconf/pkg-config，无法检测 FFmpeg 依赖"
    return $false
  }

  $missingLibs = @()
  $libs = @("libavutil", "libavcodec", "libavformat", "libavfilter", "libswscale")

  foreach ($lib in $libs) {
    try {
      $version = & $pkgConfigPath --modversion $lib 2>$null
      if ($LASTEXITCODE -eq 0) {
        Write-Info "${lib}: $version"
      } else {
        Write-Warn "$lib 未找到"
        $missingLibs += $lib
      }
    } catch {
      Write-Warn "$lib 未找到"
      $missingLibs += $lib
    }
  }

  return $missingLibs.Count -eq 0
}

function Get-VcpkgPath {
  try {
    $vcpkg = Get-Command vcpkg -ErrorAction SilentlyContinue
    if ($null -ne $vcpkg) {
      return $vcpkg.Source
    }
  } catch {
    # keep checking default paths
  }

  if ($env:VCPKG_ROOT) {
    $fromEnv = Join-Path $env:VCPKG_ROOT "vcpkg.exe"
    if (Test-Path $fromEnv) {
      return $fromEnv
    }
  }

  $vcpkgPaths = @(
    "$env:USERPROFILE\vcpkg\vcpkg.exe",
    "C:\vcpkg\vcpkg.exe",
    "C:\tools\vcpkg\vcpkg.exe"
  )

  foreach ($path in $vcpkgPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  return $null
}

function Test-Vcpkg {
  $vcpkgPath = Get-VcpkgPath
  return $null -ne $vcpkgPath
}

function Get-VcpkgRoot {
  $vcpkgPath = Get-VcpkgPath
  if ($null -eq $vcpkgPath) {
    return $null
  }

  return (Split-Path -Parent $vcpkgPath)
}

function Set-PkgConfigPath {
  $vcpkgRoot = Get-VcpkgRoot
  if ($null -eq $vcpkgRoot) {
    return
  }

  $pkgConfigPath = Join-Path $vcpkgRoot "installed\x64-windows\lib\pkgconfig"
  if (Test-Path $pkgConfigPath) {
    $currentPath = [Environment]::GetEnvironmentVariable("PKG_CONFIG_PATH", "User")
    if ($currentPath -notlike "*$pkgConfigPath*") {
      if ([string]::IsNullOrEmpty($currentPath)) {
        [Environment]::SetEnvironmentVariable("PKG_CONFIG_PATH", $pkgConfigPath, "User")
      } else {
        [Environment]::SetEnvironmentVariable("PKG_CONFIG_PATH", "$currentPath;$pkgConfigPath", "User")
      }
      Write-Info "已设置用户级 PKG_CONFIG_PATH: $pkgConfigPath"
      Write-Warn "请重新打开终端或重启 PowerShell 让环境变量生效"
    } else {
      Write-Info "PKG_CONFIG_PATH 已包含 $pkgConfigPath"
    }

    $env:PKG_CONFIG_PATH = if ($env:PKG_CONFIG_PATH) { "$env:PKG_CONFIG_PATH;$pkgConfigPath" } else { $pkgConfigPath }
  }
}

function Install-Vcpkg {
  Write-Info "尝试下载 vcpkg.exe（不使用 bootstrap）..."

  $targetDir = if ($env:VCPKG_ROOT) { $env:VCPKG_ROOT } else { Join-Path $env:USERPROFILE "vcpkg" }
  $targetExe = Join-Path $targetDir "vcpkg.exe"

  if (Test-Path $targetExe) {
    Write-Info "检测到 $targetExe 已存在"
    return $true
  }

  $vcpkgUrl = "https://github.com/microsoft/vcpkg/releases/latest/download/vcpkg.exe"

  try {
    if (-not (Test-Path $targetDir)) {
      # Clone vcpkg repo to get specific version
      Write-Info "克隆 vcpkg 仓库..."
      git clone https://github.com/microsoft/vcpkg.git $targetDir
      if ($LASTEXITCODE -ne 0) {
        throw "git clone failed"
      }
      
      # Checkout specific commit for FFmpeg 7.1 (Dec 2024)
      Push-Location $targetDir
      try {
        Write-Info "切换到指定 commit (5c64372)..."
        git checkout 5c64372
      } finally {
        Pop-Location
      }

      Write-Info "运行 bootstrap-vcpkg..."
      $bootstrap = Join-Path $targetDir "bootstrap-vcpkg.bat"
      & $bootstrap
    }

    if (Test-Path $targetExe) {
      Write-Info "vcpkg.exe 下载完成: $targetExe"
      return $true
    }

    Write-ErrMsg "未找到下载后的 vcpkg.exe，安装可能失败"
    return $false
  } catch {
    Write-ErrMsg "下载 vcpkg.exe 时出错: $_"
    return $false
  }
}

function Install-PkgConfig {
  Write-Info "尝试使用 vcpkg 安装 pkgconf..."

  $vcpkgPath = Get-VcpkgPath
  if ($null -eq $vcpkgPath) {
    Write-ErrMsg "未找到 vcpkg，无法自动安装 pkgconf"
    return $false
  }

  try {
    Write-Info "正在安装 pkgconf (可能需要几分钟)..."
    & $vcpkgPath install pkgconf:x64-windows
    if ($LASTEXITCODE -eq 0) {
      Write-Info "pkgconf 安装成功"
      Set-PkgConfigPath

      $vcpkgRoot = Get-VcpkgRoot
      if ($null -ne $vcpkgRoot) {
        $pkgConfigDir = Join-Path $vcpkgRoot "installed\x64-windows\tools\pkgconf"
        if (Test-Path $pkgConfigDir -and ($env:PATH -notlike "*$pkgConfigDir*")) {
          $env:PATH = "$pkgConfigDir;$env:PATH"
          Write-Info "已将 pkgconf 加入当前会话 PATH"
        }
      }

      return $true
    } else {
      Write-ErrMsg "pkgconf 安装失败"
      return $false
    }
  } catch {
    Write-ErrMsg "安装 pkgconf 时出错: $_"
    return $false
  }
}

function Install-FFmpeg {
  Write-Info "尝试使用 vcpkg 安装 FFmpeg..."

  $vcpkgPath = Get-VcpkgPath
  if ($null -eq $vcpkgPath) {
    Write-ErrMsg "未找到 vcpkg，无法自动安装 FFmpeg"
    return $false
  }

  try {
    Write-Info "正在安装 FFmpeg (包含 x264, x265)..."
    & $vcpkgPath install "ffmpeg[gpl,x264,x265]:x64-windows" --recurse
    if ($LASTEXITCODE -eq 0) {
      Write-Info "FFmpeg 安装成功"
      Set-PkgConfigPath
      return $true
    } else {
      Write-ErrMsg "FFmpeg 安装失败"
      return $false
    }
  } catch {
    Write-ErrMsg "安装 FFmpeg 时出错: $_"
    return $false
  }
}

function Main {
  Write-Info "开始检测 FFmpeg 依赖..."
  Write-Host ""

  if (-not (Test-Vcpkg)) {
    Write-Warn "未找到 vcpkg，尝试自动安装..."
    if (-not (Install-Vcpkg)) {
      Write-ErrMsg "自动安装 vcpkg 失败，请手动安装后重试"
      exit 1
    }
  }

  if (-not (Test-Vcpkg)) {
    Write-ErrMsg "vcpkg 仍不可用，请手动安装后重试"
    exit 1
  }

  $needPkgConfig = -not (Test-PkgConfig)
  if ($needPkgConfig) {
    Write-Warn "pkgconf/pkg-config 未安装，开始自动安装..."
    Write-Host ""
    if (-not (Install-PkgConfig)) {
      Write-ErrMsg "pkgconf 安装失败"
      exit 1
    }
    Write-Host ""

    if (-not (Test-PkgConfig)) {
      Write-Warn "pkgconf 仍不可用，可能需要重新打开终端后再试"
      Write-Info "请重启终端或手动检查 PKG_CONFIG_PATH"
    }
  }

  $needFFmpeg = $false
  if (Test-PkgConfig) {
    $needFFmpeg = -not (Test-FFmpegLibs)
  } else {
    Write-Warn "pkgconf/pkg-config 不可用，假定需要安装 FFmpeg"
    $needFFmpeg = $true
  }

  if ($needFFmpeg) {
    Write-Warn "FFmpeg 依赖未完整安装，开始自动安装..."
    Write-Host ""
    if (-not (Install-FFmpeg)) {
      Write-ErrMsg "FFmpeg 安装失败"
      exit 1
    }
    Write-Host ""

    if (Test-PkgConfig) {
      $needFFmpeg = -not (Test-FFmpegLibs)
    }
  }

  Write-Host ""
  Write-Info "验证安装状态..."

  $pkgConfigOk = Test-PkgConfig
  $ffmpegOk = if ($pkgConfigOk) { Test-FFmpegLibs } else { $false }

  if ($pkgConfigOk -and $ffmpegOk) {
    Write-Info "✅ 所有依赖安装并通过验证"
    Write-Host ""
    Write-Info "如仍有问题，请确认："
    Write-Info "  1. 已重新打开终端/PowerShell"
    Write-Info "  2. PKG_CONFIG_PATH 已正确指向 vcpkg\\installed\\x64-windows\\lib\\pkgconfig"
  } else {
    Write-ErrMsg "❌ 依赖安装或验证失败"
    if (-not $pkgConfigOk) {
      Write-ErrMsg "  - pkgconf/pkg-config 未正确安装或未在 PATH 中"
    }
    if (-not $ffmpegOk) {
      Write-ErrMsg "  - FFmpeg 库未正确安装"
    }
    Write-Host ""
    Write-Info "可尝试："
    Write-Info "  1. 重新运行本脚本"
    Write-Info "  2. 检查 vcpkg 安装路径是否存在"
    Write-Info "  3. 手动设置 PKG_CONFIG_PATH 并重启终端"
    exit 1
  }
}

Main
