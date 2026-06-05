# Copy FFmpeg DLLs from vcpkg into bundle resources and next to viko.exe.
# NSIS does not auto-include DLLs from target/release (unlike WiX MSI).

$ErrorActionPreference = "Stop"

function Get-VcpkgRoot {
    if ($env:VCPKG_ROOT -and (Test-Path (Join-Path $env:VCPKG_ROOT "vcpkg.exe"))) {
        return $env:VCPKG_ROOT
    }

    $candidates = @(
        (Join-Path $env:USERPROFILE "vcpkg"),
        "C:\vcpkg",
        "C:\tools\vcpkg"
    )

    foreach ($root in $candidates) {
        if (Test-Path (Join-Path $root "vcpkg.exe")) {
            return $root
        }
    }

    return $null
}

function Get-FfmpegBinDir {
    if ($env:FFMPEG_BUNDLE_DIR -and (Test-Path $env:FFMPEG_BUNDLE_DIR)) {
        return $env:FFMPEG_BUNDLE_DIR
    }

    $vcpkgRoot = Get-VcpkgRoot
    if ($null -eq $vcpkgRoot) {
        return $null
    }

    $binDir = Join-Path $vcpkgRoot "installed\x64-windows\bin"
    if (Test-Path $binDir) {
        return $binDir
    }

    return $null
}

$binDir = Get-FfmpegBinDir
if ($null -eq $binDir) {
    Write-Error "FFmpeg bin directory not found. Set VCPKG_ROOT or FFMPEG_BUNDLE_DIR."
}

$resourcesDir = Join-Path $PSScriptRoot "..\src-tauri\resources\ffmpeg\windows"
$resourcesDir = [System.IO.Path]::GetFullPath($resourcesDir)
New-Item -ItemType Directory -Force -Path $resourcesDir | Out-Null

$dlls = Get-ChildItem -Path $binDir -Filter "*.dll" -File
if ($dlls.Count -eq 0) {
    Write-Error "No DLLs found in $binDir"
}

$copied = 0
foreach ($dll in $dlls) {
    Copy-Item -Path $dll.FullName -Destination (Join-Path $resourcesDir $dll.Name) -Force
    $copied++
}

Write-Host "Copied $copied DLL(s) from $binDir to $resourcesDir"

$releaseDirs = Get-ChildItem -Path (Join-Path $PSScriptRoot "..\src-tauri\target") -Directory -Recurse -Filter "release" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "x86_64-pc-windows-msvc\\release$" -and (Test-Path (Join-Path $_.FullName "viko.exe")) }

foreach ($releaseDir in $releaseDirs) {
    Write-Host "Copying DLLs next to $($releaseDir.FullName)\viko.exe"
    foreach ($dll in $dlls) {
        Copy-Item -Path $dll.FullName -Destination (Join-Path $releaseDir.FullName $dll.Name) -Force
    }
}

Write-Host "Windows FFmpeg DLL bundling complete."
