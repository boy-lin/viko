pub mod commands;
pub mod events;
pub mod media_common;
pub mod services;
pub mod shared;
pub mod storage;
pub mod task;

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

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SingleInstancePayload {
    args: Vec<String>,
    cwd: String,
}

const SINGLE_INSTANCE_ADDR: &str = "127.0.0.1:38947";

fn send_to_primary_instance(args: Vec<String>, cwd: String) -> bool {
    match TcpStream::connect(SINGLE_INSTANCE_ADDR) {
        Ok(mut stream) => {
            let payload = SingleInstancePayload { args, cwd };
            if let Ok(json) = serde_json::to_string(&payload) {
                return stream.write_all(json.as_bytes()).is_ok();
            }
            false
        }
        Err(_) => false,
    }
}

fn setup_single_instance_or_exit() -> Option<TcpListener> {
    match TcpListener::bind(SINGLE_INSTANCE_ADDR) {
        Ok(listener) => Some(listener),
        Err(_) => {
            let args: Vec<String> = std::env::args().skip(1).collect();
            let cwd = std::env::current_dir()
                .ok()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            if send_to_primary_instance(args, cwd) {
                None
            } else {
                eprintln!(
                    "Another instance may be running, but argument forwarding failed. Continue launching."
                );
                TcpListener::bind("127.0.0.1:0").ok()
            }
        }
    }
}

fn spawn_single_instance_listener(
    listener: TcpListener,
    app: tauri::AppHandle,
) {
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut buf = String::new();
            if stream.read_to_string(&mut buf).is_err() {
                continue;
            }
            let Ok(payload) = serde_json::from_str::<SingleInstancePayload>(&buf) else {
                continue;
            };
            let _ = app.emit("single-instance", payload);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let Some(single_instance_listener) = setup_single_instance_or_exit() else {
        return;
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .level_for("sqlx", log::LevelFilter::Warn)
                .level_for("sqlx::query", log::LevelFilter::Warn)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            crate::commands::get_media_info,
            crate::commands::media_task_submit,
            crate::commands::media_task_has_running_by_type,
            crate::commands::media_task_clear_by_type,
            crate::commands::media_task_clear_by_type_with_stop,
            crate::commands::media_task_cancel_task,
            crate::commands::run_self_check,
            crate::commands::video_player_open,
            crate::commands::video_player_play,
            crate::commands::video_player_pause,
            crate::commands::video_player_seek,
            crate::commands::video_player_get_position,
            crate::commands::video_player_get_duration,
            crate::commands::video_player_get_size,
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
            crate::commands::get_detailed_media_info_batch,
            crate::commands::get_detailed_image_info,
            crate::commands::probe_media_info,
            crate::commands::probe_media_info_batch,
            crate::commands::check_hardware_acceleration,
            crate::commands::convert_gif_file,
            crate::commands::generate_media_thumbnail,
            crate::services::convert::image::convert_image_file,
            crate::commands::compress_video_file,
            crate::commands::compress_audio_file,
            crate::commands::compress_image_file,
            crate::commands::write_media_metadata,
            crate::commands::get_device_id,
            crate::commands::auth_exchange_code,
            crate::commands::updater_guard_report_success,
            crate::commands::updater_guard_report_failure,
            crate::commands::updater_guard_get_status,
            crate::commands::updater_guard_reset,
            crate::commands::get_task_history,
            crate::commands::get_my_files,
            crate::commands::delete_task_history,
            crate::commands::clear_task_history,
            crate::commands::report_client_log,
            crate::commands::export_logs_archive,
        ])
        .setup(move |app| {
            spawn_single_instance_listener(single_instance_listener, app.handle().clone());

            let window = app.get_webview_window("main");
            if let Some(window) = window {
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
                crate::storage::db::init_db()
                    .await
                    .expect("failed to init db");
                crate::storage::media_queue::init()
                    .await
                    .expect("failed to init media_queue");
                crate::storage::task_history::init()
                    .await
                    .expect("failed to init task_history");
                crate::storage::updater_guard::init()
                    .await
                    .expect("failed to init updater_guard");

                // Mark long-running tasks from previous sessions as interrupted.
                // 24 hours cutoff to avoid false positives for long conversions.
                if let Ok(affected) =
                    crate::storage::task_history::cleanup_stale_processing(2 * 60 * 60 * 1000)
                        .await
                {
                    if affected > 0 {
                        log::info!("Marked {} stale tasks as interrupted", affected);
                    }
                }
            });

            // 仅在 release 构建中加载捆绑的 FFmpeg 动态库。
            // debug 构建直接依赖编译期链接的系统 FFmpeg（Homebrew），
            // bundled dylib 经过 install_name_tool 修改，路径仅在 .app 包内有效。
            #[cfg(not(debug_assertions))]
            if let Ok(resource_dir) = app.path().resource_dir() {
                let bundled_dir = crate::services::ffmpeg::loader::bundled_ffmpeg_dir(&resource_dir);
                if let Err(e) = crate::services::ffmpeg::loader::load_bundled_ffmpeg(&resource_dir)
                {
                    log::warn!(
                        "Failed to load bundled FFmpeg from {}: {}",
                        bundled_dir.display(),
                        e
                    );
                } else {
                    log::info!("Loaded bundled FFmpeg from: {}", bundled_dir.display());
                }
            } else {
                log::warn!("Failed to resolve resource_dir; FFmpeg will rely on system libs");
            }

            app.manage(std::sync::Mutex::new(
                None::<crate::services::player::video::VideoPlayer<crate::events::WindowEmitter>>,
            ));
            app.manage(std::sync::Mutex::new(
                None::<crate::services::player::audio::AudioPlayer<crate::events::WindowEmitter>>,
            ));

            log::info!("Tauri application setup completed");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
