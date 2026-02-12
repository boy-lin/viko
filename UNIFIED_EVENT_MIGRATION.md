# 统一事件系统迁移指南

## 概述

为了减少事件监听器的数量，我们将所有转码和压缩任务的 progress、complete、error 事件统一为一个 `media_task_event` 事件。

## 前端改动（已完成）

### 事件类型定义

```typescript
export type MediaTaskEvent = {
  taskId: string;
  taskType: "convert" | "compress";
  mediaType: "video" | "audio" | "image";
  eventType: "progress" | "complete" | "error";
  progress?: number;
  outputPath?: string;
  errorMessage?: string;
};
```

### 前端使用方式

前端现在只需要监听一个 `media_task_event` 事件，通过 `taskId` 过滤属于当前任务的事件。

## 后端需要修改的地方

### 1. 创建统一的事件发射辅助函数

在 `src-tauri/src/lib.rs` 或新建一个 `src-tauri/src/events.rs` 文件中添加：

```rust
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
    let _ = window.emit("media_task_event", event);
}
```

### 2. 修改压缩相关函数

#### video_compressor.rs

替换所有 `window.emit("video-compression-progress", ...)` 为：
```rust
emit_media_task_event(&window, &task_id, "compress", "video", "progress", Some(progress), None, None);
```

替换 `window.emit("video-compression-complete", ...)` 为：
```rust
emit_media_task_event(&window, &task_id, "compress", "video", "complete", Some(100.0), Some(output_path), None);
```

替换 `window.emit("video-compression-error", ...)` 为：
```rust
emit_media_task_event(&window, &task_id, "compress", "video", "error", None, None, Some(error_message));
```

#### audio_compressor.rs

类似地替换所有音频压缩相关的事件发射。

#### image_compressor.rs

类似地替换所有图片压缩相关的事件发射。

### 3. 修改转换相关函数

#### video_converter.rs

替换所有 `window.emit("video-conversion-progress", ...)` 为：
```rust
emit_media_task_event(&window, &task_id, "convert", "video", "progress", Some(progress), None, None);
```

#### audio_converter.rs

替换所有 `window.emit("audio-conversion-progress", ...)` 为：
```rust
emit_media_task_event(&window, &task_id, "convert", "audio", "progress", Some(progress), None, None);
```

#### gif_converter.rs

类似地替换 GIF 转换相关的事件发射。

### 4. 修改 commands.rs

所有命令函数需要接收 `task_id` 参数，并传递给相应的处理函数。

例如：
```rust
#[command]
pub fn compress_video_file(app: AppHandle, args: VideoCompressionArgs) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("未找到主窗口")?;
    let window = window.clone();
    let task_id = args.task_id.clone(); // 从 args 中获取 task_id

    std::thread::spawn(move || {
        let params = crate::video_compressor::VideoCompressionParams {
            input_path: args.input_path,
            output_path: args.output_path.clone(),
            compression_ratio: args.compression_ratio,
        };

        if let Err(e) = crate::video_compressor::compress_video_file(&window, params, task_id) {
            emit_media_task_event(&window, &task_id, "compress", "video", "error", None, None, Some(e));
        }
    });

    Ok(())
}
```

## 注意事项

1. 所有压缩和转换函数都需要接收 `task_id` 参数
2. 确保 `task_id` 从命令参数传递到处理函数
3. 进度值统一为 0-100 的浮点数
4. 错误消息统一为字符串
5. 完成事件必须包含 `output_path`

## 向后兼容

为了保持向后兼容，可以暂时保留旧的事件发射（但前端不再监听），或者完全移除旧的事件发射。
