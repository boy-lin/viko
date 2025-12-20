# PowerShell 脚本 - 自动检测和安装 FFmpeg 依赖 (Windows)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# 检测 pkg-config
function Test-PkgConfig {
    try {
        $pkgConfig = Get-Command pkg-config -ErrorAction SilentlyContinue
        if ($pkgConfig) {
            $version = & pkg-config --version
            Write-Info "pkg-config 已安装: $version"
            return $true
        } else {
            Write-Warn "pkg-config 未安装"
            return $false
        }
    } catch {
        Write-Warn "pkg-config 未安装"
        return $false
    }
}

# 检测 FFmpeg 库
function Test-FFmpegLibs {
    $missingLibs = @()
    
    $libs = @("libavutil", "libavcodec", "libavformat", "libavfilter", "libswscale")
    
    foreach ($lib in $libs) {
        try {
            $version = & pkg-config --modversion $lib 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Info "$lib`: $version"
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

# 检测 Chocolatey
function Test-Chocolatey {
    try {
        $choco = Get-Command choco -ErrorAction SilentlyContinue
        return $null -ne $choco
    } catch {
        return $false
    }
}

# 检测 vcpkg
function Test-Vcpkg {
    try {
        $vcpkg = Get-Command vcpkg -ErrorAction SilentlyContinue
        return $null -ne $vcpkg
    } catch {
        # 检查常见路径
        $vcpkgPaths = @(
            "$env:USERPROFILE\vcpkg\vcpkg.exe",
            "C:\vcpkg\vcpkg.exe",
            "C:\tools\vcpkg\vcpkg.exe"
        )
        
        foreach ($path in $vcpkgPaths) {
            if (Test-Path $path) {
                return $true
            }
        }
        
        return $false
    }
}

# 使用 Chocolatey 安装
function Install-WithChocolatey {
    Write-Info "使用 Chocolatey 安装依赖..."
    
    if (!(Test-PkgConfig)) {
        Write-Info "安装 pkg-config..."
        & choco install pkgconfiglite -y
    }
    
    if (!(Test-FFmpegLibs)) {
        Write-Info "安装 FFmpeg..."
        & choco install ffmpeg -y
    }
}

# 使用 vcpkg 安装
function Install-WithVcpkg {
    Write-Info "使用 vcpkg 安装依赖..."
    
    # 查找 vcpkg
    $vcpkgPath = $null
    $vcpkgPaths = @(
        "$env:USERPROFILE\vcpkg\vcpkg.exe",
        "C:\vcpkg\vcpkg.exe",
        "C:\tools\vcpkg\vcpkg.exe"
    )
    
    foreach ($path in $vcpkgPaths) {
        if (Test-Path $path) {
            $vcpkgPath = $path
            break
        }
    }
    
    if ($null -eq $vcpkgPath) {
        Write-Error "未找到 vcpkg，请先安装 vcpkg"
        Write-Info "安装 vcpkg:"
        Write-Info "  git clone https://github.com/Microsoft/vcpkg.git"
        Write-Info "  .\vcpkg\bootstrap-vcpkg.bat"
        exit 1
    }
    
    Write-Info "安装 FFmpeg..."
    & $vcpkgPath install ffmpeg:x64-windows
    
    Write-Warn "请设置环境变量:"
    Write-Warn "  PKG_CONFIG_PATH=<vcpkg安装路径>\installed\x64-windows\lib\pkgconfig"
}

# 主函数
function Main {
    Write-Info "开始检测 FFmpeg 依赖..."
    Write-Host ""
    
    $needPkgConfig = !(Test-PkgConfig)
    $needFFmpeg = $false
    
    if (Test-PkgConfig) {
        $needFFmpeg = !(Test-FFmpegLibs)
    } else {
        Write-Warn "无法检测 FFmpeg 库（pkg-config 未安装）"
        $needFFmpeg = $true
    }
    
    Write-Host ""
    
    if (!$needPkgConfig -and !$needFFmpeg) {
        Write-Info "所有依赖已安装！"
        return
    }
    
    # 选择安装方式
    if (Test-Chocolatey) {
        Install-WithChocolatey
    } elseif (Test-Vcpkg) {
        Install-WithVcpkg
    } else {
        Write-Error "未找到包管理器 (Chocolatey 或 vcpkg)"
        Write-Host ""
        Write-Info "请选择以下方式之一："
        Write-Host ""
        Write-Info "1. 安装 Chocolatey:"
        Write-Info "   Set-ExecutionPolicy Bypass -Scope Process -Force;"
        Write-Info "   [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072;"
        Write-Info "   iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
        Write-Host ""
        Write-Info "2. 安装 vcpkg:"
        Write-Info "   git clone https://github.com/Microsoft/vcpkg.git"
        Write-Info "   .\vcpkg\bootstrap-vcpkg.bat"
        Write-Host ""
        Write-Info "3. 下载预编译版本:"
        Write-Info "   https://www.gyan.dev/ffmpeg/builds/"
        exit 1
    }
    
    Write-Host ""
    Write-Info "验证安装..."
    
    if ((Test-PkgConfig) -and (Test-FFmpegLibs)) {
        Write-Info "✓ 所有依赖安装成功！"
    } else {
        Write-Error "✗ 依赖安装失败，请手动检查"
        exit 1
    }
}

Main

