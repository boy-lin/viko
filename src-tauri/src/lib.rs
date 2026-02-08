pub mod commands;
pub mod events;
pub mod media_common;
pub mod services;
pub mod task;
pub mod shared;
pub mod storage;

#[derive(Clone, Copy)]
pub enum ControlCommand {
    Play,
    Pause,
}

#[derive(Clone)]
pub struct SharedClock {
    start_time: std::sync::Arc<std::sync::Mutex<Option<std::time::Instant>>>,
    is_playing: std::sync::Arc<std::sync::Mutex<bool>>,
    start_position: std::sync::Arc<std::sync::Mutex<f64>>,
}

impl SharedClock {
    pub fn new() -> Self {
        Self {
            start_time: std::sync::Arc::new(std::sync::Mutex::new(None)),
            is_playing: std::sync::Arc::new(std::sync::Mutex::new(false)),
            start_position: std::sync::Arc::new(std::sync::Mutex::new(0.0)),
        }
    }

    pub fn start(&self, position: f64) {
        let mut start_time = self.start_time.lock().unwrap();
        *start_time = Some(std::time::Instant::now());
        let mut is_playing = self.is_playing.lock().unwrap();
        *is_playing = true;
        let mut start_position = self.start_position.lock().unwrap();
        *start_position = position;
    }

    pub fn pause(&self) {
        let mut is_playing = self.is_playing.lock().unwrap();
        *is_playing = false;
    }

    pub fn resume(&self) {
        let mut is_playing = self.is_playing.lock().unwrap();
        *is_playing = true;
    }

    pub fn get_elapsed_time(&self) -> Option<std::time::Duration> {
        let start_time = self.start_time.lock().unwrap();
        let is_playing = self.is_playing.lock().unwrap();

        if *is_playing {
            start_time.map(|start| start.elapsed())
        } else {
            None
        }
    }

    pub fn get_position(&self) -> f64 {
        let start_position = *self.start_position.lock().unwrap();
        if let Some(elapsed) = self.get_elapsed_time() {
            start_position + elapsed.as_secs_f64()
        } else {
            start_position
        }
    }

    pub fn seek(&self, position: f64) {
        let mut start_time = self.start_time.lock().unwrap();
        *start_time = Some(std::time::Instant::now());
        let mut start_position = self.start_position.lock().unwrap();
        *start_position = position;
    }
}

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            crate::commands::get_media_info,
            crate::commands::media_task_submit,
            crate::commands::media_task_has_running,
            crate::commands::media_task_clear,
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
            crate::commands::get_audio_file_info,
            crate::commands::convert_audio_file,
            crate::commands::get_detailed_media_info,
            crate::commands::check_hardware_acceleration,
            crate::commands::convert_gif_file,
            crate::commands::generate_media_thumbnail,
            crate::services::convert::image::convert_image_file,
            crate::commands::compress_video_file,
            crate::commands::compress_audio_file,
            crate::commands::compress_image_file,
            crate::commands::write_media_metadata,
            crate::commands::get_device_id,
            crate::commands::get_task_history,
            crate::commands::get_my_files,
            crate::commands::set_my_file_favorite,
            crate::commands::delete_task_history,
            crate::commands::clear_task_history,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main");
            if let Some(window) = window {
                // 妫€鏌ユ槸鍚﹁缃簡杩滅▼ URL 鐜鍙橀噺
                if let Ok(remote_url) = std::env::var("TAURI_REMOTE_URL") {
                    if !remote_url.is_empty() {
                        log::info!("Loading remote URL: {}", remote_url);
                        if let Ok(url) = tauri::Url::parse(&remote_url) {
                            if let Err(e) = window.navigate(url) {
                                log::error!("Failed to navigate to remote URL: {}", e);
                            }
                        } else {
                            log::error!("Invalid remote URL format: {}", remote_url);
                        }
                    }
                } else {
                    log::info!("Using local frontend (devUrl or bundled files)");
                }
            }

            // Init database
            tauri::async_runtime::block_on(async {
                crate::storage::db::init_db().await.expect("failed to init db");
                crate::storage::media_queue::init().await.expect("failed to init media_queue");
                crate::storage::task_history::init().await.expect("failed to init task_history");
                crate::storage::favorites::init().await.expect("failed to init task_favorites");
            });

            app.manage(std::sync::Mutex::new(
                None::<crate::services::player::video::VideoPlayer<crate::events::WindowEmitter>>,
            ));
            app.manage(std::sync::Mutex::new(None::<crate::services::player::audio::AudioPlayer<crate::events::WindowEmitter>>));

            log::info!("Tauri application setup completed");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
