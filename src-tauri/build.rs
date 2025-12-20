fn main() {
    // 设置 PKG_CONFIG_PATH 以确保能找到 FFmpeg 库
    // 这对于 macOS Homebrew 安装的 FFmpeg 很重要
    // 注意：std::env::set_var 是 unsafe 的，因为修改全局环境变量
    if let Ok(brew_prefix) = std::env::var("HOMEBREW_PREFIX") {
        let pkg_config_path = format!("{}/lib/pkgconfig", brew_prefix);
        if std::path::Path::new(&pkg_config_path).exists() {
            if let Ok(existing) = std::env::var("PKG_CONFIG_PATH") {
                unsafe {
                    std::env::set_var(
                        "PKG_CONFIG_PATH",
                        format!("{}:{}", pkg_config_path, existing),
                    );
                }
            } else {
                unsafe {
                    std::env::set_var("PKG_CONFIG_PATH", pkg_config_path);
                }
            }
        }
    } else {
        // 如果没有 HOMEBREW_PREFIX，尝试默认路径
        let default_path = "/opt/homebrew/lib/pkgconfig";
        if std::path::Path::new(default_path).exists() {
            if let Ok(existing) = std::env::var("PKG_CONFIG_PATH") {
                unsafe {
                    std::env::set_var("PKG_CONFIG_PATH", format!("{}:{}", default_path, existing));
                }
            } else {
                unsafe {
                    std::env::set_var("PKG_CONFIG_PATH", default_path);
                }
            }
        }
    }

    tauri_build::build()
}
