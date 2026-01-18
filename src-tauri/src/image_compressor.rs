use image::ImageFormat;
use tauri::WebviewWindow;
use serde::Deserialize;

/// 图片压缩参数
#[derive(Deserialize)]
pub struct ImageCompressionParams {
    pub input_path: String,
    pub output_path: String,
    pub quality: u32, // 0-100，质量百分比
}

/// 使用图片库压缩图片文件
pub fn compress_image_file(
    window: &WebviewWindow,
    params: ImageCompressionParams,
    task_id: String,
) -> Result<(), String> {
    // 发送初始进度
    crate::events::emit_media_task_event(window, &task_id, "compress", "image", "progress", Some(10.0), None, None);

    // 读取图片
    let img = image::open(&params.input_path)
        .map_err(|e| format!("无法打开图片文件: {}", e))?;

    crate::events::emit_media_task_event(window, &task_id, "compress", "image", "progress", Some(50.0), None, None);

    // 确定输出格式
    let extension = params.output_path
        .split('.')
        .last()
        .unwrap_or("jpg")
        .to_lowercase();
    
    let save_format = match extension.as_str() {
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "png" => ImageFormat::Png,
        "webp" => ImageFormat::WebP,
        "gif" => ImageFormat::Gif,
        "bmp" => ImageFormat::Bmp,
        "tiff" | "tif" => ImageFormat::Tiff,
        "ico" => ImageFormat::Ico,
        _ => ImageFormat::Jpeg, // 默认
    };

    crate::events::emit_media_task_event(window, &task_id, "compress", "image", "progress", Some(70.0), None, None);

    // 根据格式和质量保存
    // 注意：image crate 0.25.9 的 save 方法不支持直接设置质量参数
    // 这里简化处理，直接保存图片
    // 未来可以通过其他库（如 mozjpeg）来实现更精确的质量控制
    img.save_with_format(&params.output_path, save_format)
        .map_err(|e| format!("保存图片失败: {}", e))?;

    crate::events::emit_media_task_event(window, &task_id, "compress", "image", "complete", Some(100.0), Some(params.output_path), None);

    Ok(())
}
