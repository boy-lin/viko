// 声明模块 Cursor Write It
pub mod commands;

// Tauri 应用入口文件，注册所有后端命令 Cursor Write It
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            crate::commands::get_media_info,
            crate::commands::ffmpeg_exec,
            crate::commands::run_self_check,
            crate::commands::list_modules,
            crate::commands::set_active_module,
            crate::commands::delete_module,
            crate::commands::download_custom_module,
        ])
        .setup(|_app| {
            log::info!("Tauri 应用设置完成");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
