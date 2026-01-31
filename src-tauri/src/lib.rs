// 澹版槑妯″潡 Cursor Write It
pub mod commands;
pub mod events;
pub mod media_common;
pub mod services;
pub mod task;

// 闊抽妯″潡闇€瑕佺殑鍏变韩绫诲瀷
#[derive(Clone, Copy)]
pub enum ControlCommand {
    Play,
    Pause,
}

// 鍏变韩鏃堕挓鐢ㄤ簬闊宠棰戝悓姝?
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

// Tauri 搴旂敤鍏ュ彛鏂囦欢锛屾敞鍐屾墍鏈夊悗绔懡浠?Cursor Write It
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
            crate::commands::convert_video_file,
            crate::commands::convert_gif_file,
            crate::commands::generate_media_thumbnail,
            crate::services::convert::image::convert_image_file,
            crate::commands::compress_video_file,
            crate::commands::compress_audio_file,
            crate::commands::compress_image_file,
            crate::commands::write_media_metadata,
            crate::commands::get_device_id,
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
                    // 寮€鍙戠幆澧冩垨鏈缃繙绋?URL锛屼娇鐢ㄩ粯璁よ涓猴紙鏈湴鏂囦欢鎴?devUrl锛?
                    log::info!("Using local frontend (devUrl or bundled files)");
                }
            }

            // 鍒濆鍖栬棰戞挱鏀惧櫒鐘舵€?
            app.manage(std::sync::Mutex::new(
                None::<crate::services::player::video::VideoPlayer<crate::events::WindowEmitter>>,
            ));
            // 鍒濆鍖栭煶棰戞挱鏀惧櫒鐘舵€?
            app.manage(std::sync::Mutex::new(None::<crate::services::player::audio::AudioPlayer<crate::events::WindowEmitter>>));

            log::info!("Tauri application setup completed");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

