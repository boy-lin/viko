// 声明模块 Cursor Write It
pub mod commands;
pub mod ffmpeg_ffi;
pub mod ffmpeg_loader;
pub mod ffmpeg_media_info;
pub mod audio_player;
pub mod video_player;

use tauri::Manager;

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
            crate::commands::video_player_open,
            crate::commands::video_player_play,
            crate::commands::video_player_pause,
            crate::commands::video_player_seek,
            crate::commands::video_player_get_position,
            crate::commands::video_player_get_duration,
            crate::commands::video_player_close,
            crate::commands::video_player_set_volume,
            crate::commands::audio_player_open,
            crate::commands::audio_player_play,
            crate::commands::audio_player_pause,
            crate::commands::audio_player_seek,
            crate::commands::audio_player_stop,
            crate::commands::audio_player_set_volume,
            crate::commands::audio_player_get_position,
            crate::commands::audio_player_get_duration,
        ])
        .setup(|app| {
            // 初始化视频播放器状态
            app.manage(std::sync::Mutex::new(
                None::<crate::video_player::VideoPlayer>,
            ));
            // 初始化音频播放器状态
            app.manage(std::sync::Mutex::new(
                None::<crate::audio_player::AudioPlayer>,
            ));
            log::info!("Tauri application setup completed");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
