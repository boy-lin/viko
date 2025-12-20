// Rust 脚本 - 自动检测和安装 FFmpeg 依赖
// 使用方法: cargo run --bin check-ffmpeg-deps

use std::process::Command;
use std::io::{self, Write};

fn main() {
    println!("开始检测 FFmpeg 依赖...\n");

    // 检测 pkg-config
    let pkg_config_installed = check_pkg_config();
    
    // 检测 FFmpeg 库
    let ffmpeg_installed = if pkg_config_installed {
        check_ffmpeg_libs()
    } else {
        println!("⚠️  无法检测 FFmpeg 库（pkg-config 未安装）");
        false
    };

    println!();

    if pkg_config_installed && ffmpeg_installed {
        println!("✅ 所有依赖已安装！");
        return;
    }

    // 根据操作系统安装
    let os = detect_os();
    match os.as_str() {
        "macos" => install_macos(),
        "linux" => install_linux(),
        "windows" => install_windows(),
        _ => {
            eprintln!("❌ 不支持的操作系统: {}", os);
            std::process::exit(1);
        }
    }

    println!("\n验证安装...");
    
    if check_pkg_config() && check_ffmpeg_libs() {
        println!("✅ 所有依赖安装成功！");
    } else {
        eprintln!("❌ 依赖安装失败，请手动检查");
        std::process::exit(1);
    }
}

fn detect_os() -> String {
    if cfg!(target_os = "macos") {
        "macos".to_string()
    } else if cfg!(target_os = "linux") {
        "linux".to_string()
    } else if cfg!(target_os = "windows") {
        "windows".to_string()
    } else {
        "unknown".to_string()
    }
}

fn check_pkg_config() -> bool {
    match Command::new("pkg-config").arg("--version").output() {
        Ok(output) => {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout);
                println!("✅ pkg-config 已安装: {}", version.trim());
                true
            } else {
                println!("⚠️  pkg-config 未安装");
                false
            }
        }
        Err(_) => {
            println!("⚠️  pkg-config 未安装");
            false
        }
    }
}

fn check_ffmpeg_libs() -> bool {
    let libs = vec!["libavutil", "libavcodec", "libavformat", "libavfilter", "libswscale"];
    let mut all_installed = true;

    for lib in libs {
        match Command::new("pkg-config")
            .args(&["--modversion", lib])
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    let version = String::from_utf8_lossy(&output.stdout);
                    println!("✅ {}: {}", lib, version.trim());
                } else {
                    println!("⚠️  {} 未找到", lib);
                    all_installed = false;
                }
            }
            Err(_) => {
                println!("⚠️  {} 未找到", lib);
                all_installed = false;
            }
        }
    }

    all_installed
}

fn install_macos() {
    println!("🍎 检测到 macOS 系统");

    // 检测 Homebrew
    if Command::new("brew").arg("--version").output().is_err() {
        eprintln!("❌ 未找到 Homebrew，请先安装 Homebrew:");
        eprintln!("   /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"");
        std::process::exit(1);
    }

    println!("使用 Homebrew 安装依赖...");

    // 安装 pkg-config
    if !check_pkg_config() {
        println!("安装 pkg-config...");
        if let Err(e) = Command::new("brew").args(&["install", "pkg-config"]).status() {
            eprintln!("❌ 安装 pkg-config 失败: {}", e);
            std::process::exit(1);
        }
    }

    // 安装 FFmpeg
    if !check_ffmpeg_libs() {
        println!("安装 FFmpeg...");
        if let Err(e) = Command::new("brew").args(&["install", "ffmpeg"]).status() {
            eprintln!("❌ 安装 FFmpeg 失败: {}", e);
            std::process::exit(1);
        }
    }

    println!("✅ macOS 依赖安装完成");
}

fn install_linux() {
    println!("🐧 检测到 Linux 系统");

    // 检测包管理器
    let (pkg_manager, update_cmd, install_cmd) = if Command::new("apt-get").arg("--version").output().is_ok() {
        ("apt-get", vec!["update"], vec!["install", "-y"])
    } else if Command::new("yum").arg("--version").output().is_ok() {
        ("yum", vec!["check-update"], vec!["install", "-y"])
    } else if Command::new("dnf").arg("--version").output().is_ok() {
        ("dnf", vec!["check-update"], vec!["install", "-y"])
    } else if Command::new("pacman").arg("--version").output().is_ok() {
        ("pacman", vec!["-Sy"], vec!["-S", "--noconfirm"])
    } else {
        eprintln!("❌ 未找到支持的包管理器 (apt-get/yum/dnf/pacman)");
        std::process::exit(1);
    };

    println!("使用 {} 安装依赖...", pkg_manager);

    // 更新包列表
    println!("更新包列表...");
    let mut cmd = Command::new(format!("sudo {}", pkg_manager));
    cmd.args(&update_cmd);
    let _ = cmd.status();

    // 安装 pkg-config
    if !check_pkg_config() {
        println!("安装 pkg-config...");
        let mut cmd = Command::new("sudo");
        cmd.arg(pkg_manager);
        cmd.args(&install_cmd);
        cmd.arg("pkg-config");
        if let Err(e) = cmd.status() {
            eprintln!("❌ 安装 pkg-config 失败: {}", e);
            std::process::exit(1);
        }
    }

    // 安装 FFmpeg 开发库
    if !check_ffmpeg_libs() {
        println!("安装 FFmpeg 开发库...");
        let mut cmd = Command::new("sudo");
        cmd.arg(pkg_manager);
        cmd.args(&install_cmd);
        
        match pkg_manager {
            "apt-get" => {
                cmd.args(&["libavutil-dev", "libavcodec-dev", "libavformat-dev", "libavfilter-dev", "libswscale-dev"]);
            }
            "yum" | "dnf" => {
                cmd.arg("ffmpeg-devel");
            }
            "pacman" => {
                cmd.arg("ffmpeg");
            }
            _ => {}
        }
        
        if let Err(e) = cmd.status() {
            eprintln!("❌ 安装 FFmpeg 失败: {}", e);
            std::process::exit(1);
        }
    }

    println!("✅ Linux 依赖安装完成");
}

fn install_windows() {
    println!("🪟 检测到 Windows 系统");
    println!("⚠️  Windows 平台需要手动安装 FFmpeg");
    println!();
    println!("请选择以下方式之一：");
    println!("1. 使用 Chocolatey:");
    println!("   choco install ffmpeg");
    println!();
    println!("2. 使用 vcpkg:");
    println!("   vcpkg install ffmpeg");
    println!();
    println!("3. 下载预编译版本:");
    println!("   https://www.gyan.dev/ffmpeg/builds/");
    println!();
    println!("安装后，请设置环境变量:");
    println!("  PKG_CONFIG_PATH=<ffmpeg安装路径>\\lib\\pkgconfig");
    std::process::exit(1);
}

