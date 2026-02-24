use serde::Serialize;
use std::fs;
use tauri::Emitter;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Clone)]
pub struct MediaTaskEvent {
    pub task_id: String,
    pub task_type: String,  // MediaTaskType string, e.g. "convert-video"
    pub file_type: String, // "image" | "video" | "audio" | "gif"
    pub event_type: String, // "progress" | "complete" | "error"
    pub progress: Option<f64>,
    pub output_path: Option<String>,
    pub output_size: Option<u64>,
    pub error_message: Option<String>,
}

pub fn emit_media_task_event(
    window: &tauri::WebviewWindow,
    task_id: &str,
    task_type: &str,
    file_type: &str,
    event_type: &str,
    progress: Option<f64>,
    output_path: Option<String>,
    error_message: Option<String>,
) {
    let output_size = if event_type == "complete" {
        output_path
            .as_ref()
            .and_then(|path| fs::metadata(path).ok().map(|m| m.len()))
    } else {
        None
    };
    let event = MediaTaskEvent {
        task_id: task_id.to_string(),
        task_type: task_type.to_string(),
        file_type: file_type.to_string(),
        event_type: event_type.to_string(),
        progress,
        output_path,
        output_size,
        error_message,
    };
    let _ = window.emit("media_task_event", event);
}

pub trait TaskEmitter: Send + Sync {
    fn emit(
        &self,
        event_type: &str,
        progress: Option<f64>,
        output_path: Option<String>,
        error_message: Option<String>,
    );
}

#[derive(Clone)]
pub struct WindowEmitter {
    pub window: tauri::WebviewWindow,
    pub task_id: String,
    pub task_type: String,  // MediaTaskType string
    pub file_type: String, // "compress" | "convert" | "watermark"
}

pub fn window_emitter(
    app: &AppHandle,
    task_id: String,
    task_type: String,
    file_type: String,
) -> Result<WindowEmitter, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    Ok(WindowEmitter::new(window, task_id, task_type, file_type))
}

impl WindowEmitter {
    pub fn new(
        window: tauri::WebviewWindow,
        task_id: String,
        task_type: String,
        file_type: String,
    ) -> Self {
        Self {
            window,
            task_id,
            task_type,
            file_type,
        }
    }
}

impl TaskEmitter for WindowEmitter {
    fn emit(
        &self,
        event_type: &str,
        progress: Option<f64>,
        output_path: Option<String>,
        error_message: Option<String>,
    ) {
        emit_media_task_event(
            &self.window,
            &self.task_id,
            &self.task_type,
            &self.file_type,
            event_type,
            progress,
            output_path,
            error_message,
        );
    }
}

pub trait EventEmitter: Send + Sync + Clone + 'static {
    fn emit<S: Serialize + Clone + Send>(&self, event_type: &str, payload: S);
}

impl EventEmitter for WindowEmitter {
    fn emit<S: Serialize + Clone + Send>(&self, event_type: &str, payload: S) {
        let _ = self.window.emit(event_type, payload);
    }
}

#[derive(Clone)]
pub struct MockEmitter {
    pub events: std::sync::Arc<
        std::sync::Mutex<Vec<(String, Option<f64>, Option<String>, Option<String>)>>,
    >,
}

impl MockEmitter {
    pub fn new() -> Self {
        Self {
            events: std::sync::Arc::new(std::sync::Mutex::new(Vec::new())),
        }
    }
}

impl TaskEmitter for MockEmitter {
    fn emit(
        &self,
        event_type: &str,
        progress: Option<f64>,
        output_path: Option<String>,
        error_message: Option<String>,
    ) {
        let mut events = self.events.lock().unwrap();
        events.push((event_type.to_string(), progress, output_path, error_message));
    }
}
