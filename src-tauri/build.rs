fn main() {
    // 设置 PKG_CONFIG_PATH 以确保能找到 FFmpeg 库
    // 这对于 macOS Homebrew 安装的 FFmpeg 很重要
    // 注意：std::env::set_var 是 unsafe 的，因为修改全局环境变量
    // 必须在 tauri_build::build() 之前设置，以便子进程（如 ffmpeg-sys-next 的 build script）能看到
    
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
    
    // 4. 设置 PKG_CONFIG_PATH（必须在 tauri_build::build() 之前）
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

    // 调用 tauri_build::build() - 这会触发所有依赖的 build script
    // 此时 PKG_CONFIG_PATH 已经设置，子进程应该能看到
    tauri_build::build()
}
