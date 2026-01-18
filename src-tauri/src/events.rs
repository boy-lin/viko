use serde::Serialize;
use tauri::Emitter;

#[derive(Serialize, Clone)]
pub struct MediaTaskEvent {
    pub task_id: String,
    pub task_type: String, // "convert" | "compress"
    pub media_type: String, // "video" | "audio" | "image"
    pub event_type: String, // "progress" | "complete" | "error"
    pub progress: Option<f64>,
    pub output_path: Option<String>,
    pub error_message: Option<String>,
}

pub fn emit_media_task_event(
    window: &tauri::WebviewWindow,
    task_id: &str,
    task_type: &str,
    media_type: &str,
    event_type: &str,
    progress: Option<f64>,
    output_path: Option<String>,
    error_message: Option<String>,
) {
    let event = MediaTaskEvent {
        task_id: task_id.to_string(),
        task_type: task_type.to_string(),
        media_type: media_type.to_string(),
        event_type: event_type.to_string(),
        progress,
        output_path,
        error_message,
    };
    let _ = window.emit("media-task-event", event);
}
