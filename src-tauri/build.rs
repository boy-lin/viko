fn main() {
    // 设置 PKG_CONFIG_PATH 和 VCPKG_ROOT 以确保能找到 FFmpeg 库
    // 这对于 macOS Homebrew 安装的 FFmpeg 和 Windows vcpkg 安装的 FFmpeg 很重要
    // 注意：std::env::set_var 是 unsafe 的，因为修改全局环境变量
    // 必须在 tauri_build::build() 之前设置，以便子进程（如 ffmpeg-sys-next 的 build script）能看到

    #[cfg(target_os = "windows")]
    {
        // Windows 平台：查找并设置 vcpkg
        println!("cargo:warning=Building on Windows, searching for vcpkg...");
        let vcpkg_root = find_vcpkg_root();
        if let Some(root) = &vcpkg_root {
            unsafe {
                std::env::set_var("VCPKG_ROOT", root);
            }
            println!("cargo:rerun-if-env-changed=VCPKG_ROOT");
            println!("cargo:warning=VCPKG_ROOT set to: {}", root);

            // 设置 Windows 上的 PKG_CONFIG_PATH（使用分号分隔）
            let pkg_config_path = format!("{}\\installed\\x64-windows\\lib\\pkgconfig", root);
            if std::path::Path::new(&pkg_config_path).exists() {
                let existing = std::env::var("PKG_CONFIG_PATH").unwrap_or_default();
                let combined_path = if existing.is_empty() {
                    pkg_config_path.clone()
                } else {
                    format!("{};{}", pkg_config_path, existing)
                };

                unsafe {
                    std::env::set_var("PKG_CONFIG_PATH", &combined_path);
                }
                println!("cargo:rerun-if-env-changed=PKG_CONFIG_PATH");
                println!("cargo:warning=PKG_CONFIG_PATH set to: {}", combined_path);
            } else {
                println!(
                    "cargo:warning=PKG_CONFIG_PATH directory not found: {}",
                    pkg_config_path
                );
            }
        } else {
            println!("cargo:warning=Could not find vcpkg, ffmpeg-sys-next may fail to find FFmpeg");
            println!("cargo:warning=Please install vcpkg or set VCPKG_ROOT environment variable");
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // macOS/Linux 平台：查找 Homebrew 或其他包管理器安装的 FFmpeg
        let mut pkg_config_paths = Vec::new();

        // 1. 检查 HOMEBREW_PREFIX 环境变量
        if let Ok(brew_prefix) = std::env::var("HOMEBREW_PREFIX") {
            let path = format!("{}/lib/pkgconfig", brew_prefix);
            if std::path::Path::new(&path).exists() {
                pkg_config_paths.push(path);
            }
            // 检查 FFmpeg 的 opt 链接路径
            let ffmpeg_opt_path = format!("{}/opt/ffmpeg/lib/pkgconfig", brew_prefix);
            if std::path::Path::new(&ffmpeg_opt_path).exists() {
                pkg_config_paths.push(ffmpeg_opt_path);
            }
        }

        // 2. 尝试默认 Homebrew 路径
        let default_paths = vec![
            "/opt/homebrew/lib/pkgconfig",
            "/opt/homebrew/opt/ffmpeg/lib/pkgconfig",
            "/usr/local/lib/pkgconfig",
            "/usr/local/opt/ffmpeg/lib/pkgconfig",
        ];

        for path in default_paths {
            if std::path::Path::new(path).exists() {
                if !pkg_config_paths.contains(&path.to_string()) {
                    pkg_config_paths.push(path.to_string());
                }
            }
        }

        // 3. 查找 FFmpeg Cellar 路径（版本化安装）
        let cellar_paths = vec![
            "/opt/homebrew/Cellar/ffmpeg@7",
            "/opt/homebrew/Cellar/ffmpeg",
            "/usr/local/Cellar/ffmpeg@7",
            "/usr/local/Cellar/ffmpeg",
        ];

        for cellar_base in cellar_paths {
            if let Ok(entries) = std::fs::read_dir(cellar_base) {
                for entry in entries.flatten() {
                    let version_path = entry.path().join("lib/pkgconfig");
                    if version_path.exists() {
                        if let Some(path_str) = version_path.to_str() {
                            if !pkg_config_paths.contains(&path_str.to_string()) {
                                pkg_config_paths.push(path_str.to_string());
                            }
                        }
                    }
                }
            }
        }

        // 4. 设置 PKG_CONFIG_PATH（使用冒号分隔，Unix 风格）
        if !pkg_config_paths.is_empty() {
            let final_path = pkg_config_paths.join(":");

            // 获取现有的 PKG_CONFIG_PATH（如果有）
            let existing = std::env::var("PKG_CONFIG_PATH").unwrap_or_default();
            let combined_path = if existing.is_empty() {
                final_path.clone()
            } else {
                format!("{}:{}", final_path, existing)
            };

            // 设置环境变量（对当前进程和子进程都有效）
            unsafe {
                std::env::set_var("PKG_CONFIG_PATH", &combined_path);
            }

            // 告诉 Cargo 如果 PKG_CONFIG_PATH 改变，重新运行 build script
            println!("cargo:rerun-if-env-changed=PKG_CONFIG_PATH");
            println!("cargo:warning=PKG_CONFIG_PATH set to: {}", combined_path);
        } else {
            println!("cargo:warning=Could not find FFmpeg pkg-config files, build may fail");
        }
    }

    // 尝试将系统 FFmpeg 动态库拷贝到 bundle resources 中
    // 这样可以避免将 libav* 提交到仓库
    if let Err(err) = copy_bundled_ffmpeg_libs() {
        println!("cargo:warning=Failed to bundle FFmpeg libs: {}", err);
    }

    // 调用 tauri_build::build() - 这会触发所有依赖的 build script
    // 此时环境变量已经设置，子进程应该能看到
    tauri_build::build()
}

#[cfg(target_os = "windows")]
fn find_vcpkg_root() -> Option<String> {
    // 1. 检查环境变量 VCPKG_ROOT（如果已设置，直接使用）
    if let Ok(root) = std::env::var("VCPKG_ROOT") {
        let vcpkg_exe = format!("{}\\vcpkg.exe", root);
        println!("cargo:warning=Checking VCPKG_ROOT from env: {}", root);
        if std::path::Path::new(&vcpkg_exe).exists() {
            println!("cargo:warning=Found vcpkg.exe at: {}", vcpkg_exe);
            return Some(root);
        }
    }

    // 2. 检查常见安装路径
    let user_profile = match std::env::var("USERPROFILE") {
        Ok(profile) => profile,
        Err(e) => {
            println!("cargo:warning=Failed to get USERPROFILE: {:?}", e);
            return None;
        }
    };

    let common_paths = vec![
        format!("{}\\vcpkg", user_profile),
        "C:\\vcpkg".to_string(),
        "C:\\tools\\vcpkg".to_string(),
    ];

    println!("cargo:warning=Searching for vcpkg in common paths...");
    for path in &common_paths {
        let vcpkg_exe = format!("{}\\vcpkg.exe", path);
        println!("cargo:warning=Checking: {}", vcpkg_exe);
        if std::path::Path::new(&vcpkg_exe).exists() {
            println!("cargo:warning=Found vcpkg.exe at: {}", vcpkg_exe);
            return Some(path.clone());
        }
    }

    println!("cargo:warning=Could not find vcpkg.exe in any common location");
    None
}

fn copy_bundled_ffmpeg_libs() -> Result<(), String> {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").map_err(|e| e.to_string())?;
    let target = std::env::var("TARGET").unwrap_or_default();
    
    // Ensure the resources/ffmpeg directory exists to satisfy Tauri bundler
    let base_dest_dir = std::path::Path::new(&manifest_dir).join("resources/ffmpeg");
    std::fs::create_dir_all(&base_dest_dir).map_err(|e| e.to_string())?;

    // On macOS, we use `scripts/fix-mac-dylibs.sh` during Tauri's `beforeBundleCommand`
    // to recursively copy all FFmpeg dependencies (including x264, x265, etc.) and
    // fix their install_name references via `install_name_tool`.
    if target.contains("apple-darwin") {
        return Ok(());
    }

    let arch = if target.contains("aarch64") {
        "aarch64"
    } else if target.contains("x86_64") {
        "x86_64"
    } else {
        "unknown"
    };

    let platform_dir = if target.contains("apple-darwin") {
        format!("macos/{}", arch)
    } else if target.contains("windows") {
        "windows".to_string()
    } else {
        "linux".to_string()
    };

    let dest_dir = std::path::Path::new(&manifest_dir)
        .join("resources/ffmpeg")
        .join(platform_dir);
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let src_dir = if let Ok(dir) = std::env::var("FFMPEG_BUNDLE_DIR") {
        std::path::PathBuf::from(dir)
    } else {
        detect_ffmpeg_lib_dir()?
    };

    let lib_names = if target.contains("apple-darwin") {
        vec![
            "libavcodec.dylib",
            "libavdevice.dylib",
            "libavfilter.dylib",
            "libavformat.dylib",
            "libavutil.dylib",
            "libpostproc.dylib",
            "libswresample.dylib",
            "libswscale.dylib",
        ]
    } else {
        vec![
            "libavcodec.so",
            "libavdevice.so",
            "libavfilter.so",
            "libavformat.so",
            "libavutil.so",
            "libpostproc.so",
            "libswresample.so",
            "libswscale.so",
        ]
    };

    let mut copied_any = false;
    
    if target.contains("windows") {
        // On Windows, vcpkg appends version numbers to dlls (e.g., avformat-61.dll).
        // To ensure the DLLs are placed exactly next to `viko.exe` where the Windows loader
        // and Tauri's NSIS bundler expect them natively, copy them into the cargo output directory.
        let out_dir_env = std::env::var("OUT_DIR").expect("OUT_DIR must be set");
        let out_dir = std::path::PathBuf::from(out_dir_env);
        // OUT_DIR is typically: target/x86_64-pc-windows-msvc/release/build/viko-xxxx/out
        let exe_dir = out_dir.parent().unwrap().parent().unwrap().parent().unwrap();

        if let Ok(entries) = std::fs::read_dir(&src_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("dll") {
                    if let Some(file_name) = path.file_name() {
                        let dest = exe_dir.join(file_name);
                        if std::fs::copy(&path, &dest).is_ok() {
                            copied_any = true;
                        }
                    }
                }
            }
        }
    } else {
        for name in lib_names {
            let src = src_dir.join(name);
            if src.exists() {
                let dest = dest_dir.join(name);
                std::fs::copy(&src, &dest).map_err(|e| {
                    format!(
                        "copy failed: {} -> {} ({})",
                        src.display(),
                        dest.display(),
                        e
                    )
                })?;
                copied_any = true;
            }
        }
    }

    if !copied_any {
        return Err(format!("no FFmpeg libs found in {}", src_dir.display()));
    }

    println!("cargo:rerun-if-env-changed=FFMPEG_BUNDLE_DIR");
    Ok(())
}

fn detect_ffmpeg_lib_dir() -> Result<std::path::PathBuf, String> {
    // 1) try pkg-config
    if let Ok(output) = std::process::Command::new("pkg-config")
        .args(["--variable=libdir", "libavformat"])
        .output()
    {
        if output.status.success() {
            let dir = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !dir.is_empty() {
                let path = std::path::PathBuf::from(dir);
                if path.exists() {
                    return Ok(path);
                }
            }
        }
    }

    // 2) common paths (mac/linux)
    let common_paths = vec![
        "/opt/homebrew/opt/ffmpeg/lib",
        "/usr/local/opt/ffmpeg/lib",
        "/opt/homebrew/Cellar/ffmpeg@7",
        "/opt/homebrew/Cellar/ffmpeg",
        "/usr/local/Cellar/ffmpeg@7",
        "/usr/local/Cellar/ffmpeg",
    ];

    for base in common_paths {
        let base_path = std::path::Path::new(base);
        if base_path.ends_with("lib") && base_path.exists() {
            return Ok(base_path.to_path_buf());
        }
        if let Ok(entries) = std::fs::read_dir(base_path) {
            for entry in entries.flatten() {
                let lib_path = entry.path().join("lib");
                if lib_path.exists() {
                    return Ok(lib_path);
                }
            }
        }
    }

    // 3) windows vcpkg (if set)
    if let Ok(vcpkg_root) = std::env::var("VCPKG_ROOT") {
        let candidate = std::path::Path::new(&vcpkg_root)
            .join("installed")
            .join("x64-windows")
            .join("bin");
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("Unable to detect FFmpeg lib directory. Set FFMPEG_BUNDLE_DIR.".to_string())
}
