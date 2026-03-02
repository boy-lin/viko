use ab_glyph::{FontRef, PxScale};
use image::{imageops, GenericImageView, RgbaImage};
use imageproc::drawing::draw_text_mut;
use serde::{Deserialize, Serialize};
use std::fmt::Write;
use std::path::Path;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct WatermarkConfig {
    pub text: Option<TextWatermark>,
    pub image: Option<ImageWatermark>,
}

impl WatermarkConfig {
    pub fn build_filter_string(&self, width: u32, height: u32) -> Result<String, String> {
        let mut filter = String::new();
        let mut current_stream = "in".to_string();
        let mut stage = 0;

        // Base scaling if needed (optional, provided by caller typically, but here we assume 'in' is ready)
        // If we needed to ensure pixel format, we might start with format=pix_fmts=...

        // Handle Image Watermark
        if let Some(img) = &self.image {
            let next_stream = format!("wm_img_{}", stage);
            stage += 1;

            // 1. Load image as overlay source
            // escape path for ffmpeg: \ -> \\, : -> \:
            let safe_path = img.path.replace("\\", "/").replace(":", "\\:");

            // Prepare overlay input
            // movie=filename [logo]; [logo] scale=... [logo_scaled]
            // We append this to the start of the filter string
            let overlay_id = "wm_overlay";
            let overlay_scaled_id = "wm_overlay_scaled";

            let mut overlay_pipeline = format!("movie={}[{}];", safe_path, overlay_id);

            // Scale and Opacity for overlay
            let mut overlay_filters = Vec::new();
            if let (Some(mode), Some(value)) = (&img.size_mode, img.size_value) {
                if mode == "video_width_ratio" {
                    let ratio = if value > 1.0 { value / 100.0 } else { value };
                    let target_width = (width as f32 * ratio).max(1.0).round() as u32;
                    overlay_filters.push(format!("scale={target_width}:-1"));
                } else if mode == "scale" && value > 0.0 && (value - 1.0).abs() > 0.001 {
                    overlay_filters.push(format!("scale=iw*{}:-1", value));
                }
            } else if (img.scale - 1.0).abs() > 0.001 {
                overlay_filters.push(format!("scale=iw*{}:-1", img.scale));
            }
            if img.opacity < 1.0 {
                overlay_filters.push("format=rgba".to_string());
                overlay_filters.push(format!("colorchannelmixer=aa={}", img.opacity));
            }

            let overlay_output = if !overlay_filters.is_empty() {
                write!(
                    overlay_pipeline,
                    "[{}]{}[{}];",
                    overlay_id,
                    overlay_filters.join(","),
                    overlay_scaled_id
                )
                .unwrap();
                overlay_scaled_id
            } else {
                overlay_id
            };

            filter.push_str(&overlay_pipeline);

            // Apply overlay
            // [current][overlay_scaled] overlay=x=...:y=... [next]
            // We need to resolve x/y expressions if possible or assume ffmpeg handles them.
            // FFmpeg handles "10", "main_w-overlay_w-10" etc.
            // So we pass string directly.
            let (overlay_x, overlay_y) = if img.anchor.is_some() {
                resolve_overlay_position_expr(
                    img.anchor.as_deref(),
                    img.offset_x,
                    img.offset_y,
                    img.offset_unit.as_deref(),
                    width,
                    height,
                )
            } else {
                (img.x.clone(), img.y.clone())
            };
            write!(
                filter,
                "[{}][{}]overlay=x={}:y={}[{}];",
                current_stream, overlay_output, overlay_x, overlay_y, next_stream
            )
            .unwrap();
            current_stream = next_stream;
        }

        // Handle Text Watermark
        if let Some(txt) = &self.text {
            if txt.content.is_empty() {
                return Err("Text watermark content is empty".to_string());
            }
            let next_stream = format!("wm_txt_{}", stage);
            stage += 1;

            // escape text
            let safe_text = txt.content.replace("'", "'\\''").replace(":", "\\:");
            let safe_font = txt
                .font_path
                .as_deref()
                .unwrap_or("")
                .replace("\\", "/")
                .replace(":", "\\:");

            let font_arg = if safe_font.is_empty() {
                String::new()
            } else {
                format!("fontfile='{}':", safe_font)
            };

            let (text_x, text_y) = if txt.anchor.is_some() {
                resolve_text_position_expr(
                    txt.anchor.as_deref(),
                    txt.offset_x,
                    txt.offset_y,
                    txt.offset_unit.as_deref(),
                    width,
                    height,
                )
            } else {
                (txt.x.clone(), txt.y.clone())
            };
            let drawtext_cmd = format!(
                "drawtext={}text='{}':fontsize={}:fontcolor={}:alpha={}:x={}:y={}",
                font_arg, safe_text, txt.font_size, txt.color, txt.opacity, text_x, text_y
            );

            write!(
                filter,
                "[{}]{}[{}];",
                current_stream, drawtext_cmd, next_stream
            )
            .unwrap();
            current_stream = next_stream.to_string();
        }

        if filter.is_empty() {
            return Ok("null".to_string());
        }
        if current_stream != "out" {
            write!(filter, "[{}]null[out];", current_stream).unwrap();
        }

        Ok(filter)
    }

    pub fn apply_watermark(&self, image: &mut RgbaImage) -> Result<(), String> {
        let (width, height) = image.dimensions();

        // 1. Image Watermark
        if let Some(img_wm) = &self.image {
            // Load watermark image
            let wm_img = image::open(&img_wm.path)
                .map_err(|e| format!("Failed to open watermark image: {}", e))?;
            let mut wm_rgba = wm_img.to_rgba8();

            // Scale
            if (img_wm.scale - 1.0).abs() > 0.001 {
                let new_w = (wm_rgba.width() as f32 * img_wm.scale) as u32;
                let new_h = (wm_rgba.height() as f32 * img_wm.scale) as u32;
                wm_rgba = image::imageops::resize(
                    &wm_rgba,
                    new_w,
                    new_h,
                    image::imageops::FilterType::Lanczos3,
                );
            }

            // Opacity
            if img_wm.opacity < 1.0 {
                for pixel in wm_rgba.pixels_mut() {
                    pixel[3] = (pixel[3] as f32 * img_wm.opacity) as u8;
                }
            }

            // Position
            // Parse x/y strings. For Image, standard is generic expressions, but here we only support simple integers or "center" logic maybe?
            // Let's support simple parsing: integer, or "W-w-10" via simple eval?
            // For now: try parse as integer. If fails, default to 0.
            // A real eval engine is heavy. Let's support "10" and negative "-10" (from right?)
            // TODO: robust expression parser.

            let x = parse_position(&img_wm.x, width, wm_rgba.width());
            let y = parse_position(&img_wm.y, height, wm_rgba.height());

            imageops::overlay(image, &wm_rgba, x.into(), y.into());
        }

        // 2. Text Watermark
        if let Some(txt_wm) = &self.text {
            let font_bytes = load_font_bytes_with_fallback(txt_wm.font_path.as_deref())?;
            let font = FontRef::try_from_slice(&font_bytes).map_err(|_| "Invalid font file")?;

            // Color parsing
            let color = parse_color(&txt_wm.color, txt_wm.opacity);

            let scale = PxScale {
                x: txt_wm.font_size,
                y: txt_wm.font_size,
            };

            // Measure text for position calculation
            let (text_w, text_h) = imageproc::drawing::text_size(scale, &font, &txt_wm.content);

            let x = parse_position(&txt_wm.x, width, text_w);
            let y = parse_position(&txt_wm.y, height, text_h);

            draw_text_mut(image, color, x, y, scale, &font, &txt_wm.content);
        }

        Ok(())
    }
}

fn load_font_bytes_with_fallback(user_font_path: Option<&str>) -> Result<Vec<u8>, String> {
    if let Some(path) = user_font_path {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return std::fs::read(trimmed)
                .map_err(|error| format!("Failed to read font: {}", error));
        }
    }

    for candidate in system_font_candidates() {
        if Path::new(&candidate).exists() {
            match std::fs::read(&candidate) {
                Ok(bytes) => {
                    log::warn!("image text watermark fallback font used: {}", candidate);
                    return Ok(bytes);
                }
                Err(_) => continue,
            }
        }
    }

    Err("No usable font found. Please set watermark.text.font_path or ensure system fonts are available.".to_string())
}

fn system_font_candidates() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
        return vec![
            format!("{windir}\\Fonts\\arial.ttf"),
            format!("{windir}\\Fonts\\segoeui.ttf"),
            format!("{windir}\\Fonts\\tahoma.ttf"),
            format!("{windir}\\Fonts\\calibri.ttf"),
        ];
    }

    #[cfg(target_os = "macos")]
    {
        return vec![
            "/System/Library/Fonts/Supplemental/Arial.ttf".to_string(),
            "/System/Library/Fonts/Supplemental/Helvetica.ttf".to_string(),
            "/System/Library/Fonts/Supplemental/Times New Roman.ttf".to_string(),
        ];
    }

    #[cfg(target_os = "linux")]
    {
        return vec![
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf".to_string(),
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf".to_string(),
            "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf".to_string(),
        ];
    }

    #[allow(unreachable_code)]
    Vec::new()
}

// Helpers
fn resolve_offset_px(value: Option<f32>, unit: Option<&str>, total: u32) -> i32 {
    let v = value.unwrap_or(10.0);
    if unit.unwrap_or("px").eq_ignore_ascii_case("percent") {
        ((total as f32 * v) / 100.0).round() as i32
    } else {
        v.round() as i32
    }
}

fn resolve_overlay_position_expr(
    anchor: Option<&str>,
    offset_x: Option<f32>,
    offset_y: Option<f32>,
    offset_unit: Option<&str>,
    width: u32,
    height: u32,
) -> (String, String) {
    let a = anchor.unwrap_or("c");
    let ox = resolve_offset_px(offset_x, offset_unit, width);
    let oy = resolve_offset_px(offset_y, offset_unit, height);

    let x = if a.contains('l') {
        ox.to_string()
    } else if a.contains('r') {
        format!("main_w-overlay_w-{}", ox)
    } else {
        format!("(main_w-overlay_w)/2+{}", ox)
    };

    let y = if a.contains('t') {
        oy.to_string()
    } else if a.contains('b') {
        format!("main_h-overlay_h-{}", oy)
    } else {
        format!("(main_h-overlay_h)/2+{}", oy)
    };

    (x, y)
}

fn resolve_text_position_expr(
    anchor: Option<&str>,
    offset_x: Option<f32>,
    offset_y: Option<f32>,
    offset_unit: Option<&str>,
    width: u32,
    height: u32,
) -> (String, String) {
    let a = anchor.unwrap_or("c");
    let ox = resolve_offset_px(offset_x, offset_unit, width);
    let oy = resolve_offset_px(offset_y, offset_unit, height);

    let x = if a.contains('l') {
        ox.to_string()
    } else if a.contains('r') {
        format!("w-text_w-{}", ox)
    } else {
        format!("(w-text_w)/2+{}", ox)
    };

    let y = if a.contains('t') {
        oy.to_string()
    } else if a.contains('b') {
        format!("h-text_h-{}", oy)
    } else {
        format!("(h-text_h)/2+{}", oy)
    };

    (x, y)
}

fn parse_position(pos_str: &str, container_dim: u32, object_dim: u32) -> i32 {
    // Simple parsing:
    // "10" -> 10
    // "center" -> (container - object) / 2
    // "end-10" or "W-w-10" style?
    // Let's implement basics:
    if pos_str == "center" {
        return (container_dim as i32 - object_dim as i32) / 2;
    }
    // Try simple integer
    if let Ok(val) = pos_str.parse::<i32>() {
        return val;
    }
    // Naive expression parser for "W-w-10" (ffmpeg style)
    // Replace W with container, w with object
    let expr = pos_str.replace("W", &container_dim.to_string())
                      .replace("w", &object_dim.to_string())
                      .replace("main_w", &container_dim.to_string())
                      .replace("overlay_w", &object_dim.to_string())
                      .replace("text_w", &object_dim.to_string()) // for text
                      .replace("h", &container_dim.to_string()) // Warning: h usually height
                      // This is ambiguous for x/y if we don't know which dim.
                      // But usually x uses W/w, y uses H/h.
                      // Simplification: We assume user provides computed value or simple int mostly.
                      ;

    // Evaluate is hard without crate.
    // Fallback: 0
    0
}

fn parse_color(color_str: &str, opacity: f32) -> image::Rgba<u8> {
    // #RRGGBB
    if color_str.starts_with("#") {
        let hex = color_str.trim_start_matches('#');
        if let Ok(val) = u32::from_str_radix(hex, 16) {
            let r = ((val >> 16) & 0xFF) as u8;
            let g = ((val >> 8) & 0xFF) as u8;
            let b = (val & 0xFF) as u8;
            let a = (opacity * 255.0) as u8;
            return image::Rgba([r, g, b, a]);
        }
    }
    // "white" etc.
    match color_str.to_lowercase().as_str() {
        "white" => image::Rgba([255, 255, 255, (opacity * 255.0) as u8]),
        "black" => image::Rgba([0, 0, 0, (opacity * 255.0) as u8]),
        "red" => image::Rgba([255, 0, 0, (opacity * 255.0) as u8]),
        _ => image::Rgba([255, 255, 255, (opacity * 255.0) as u8]), // Default white
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TextWatermark {
    pub content: String,
    pub font_path: Option<String>, // Absolute path to .ttf/.otf
    pub font_size: f32,
    pub color: String, // Hex "#FFFFFF" or "white"
    pub opacity: f32,  // 0.0 - 1.0
    pub x: String,     // "10" or "W-w-10"
    pub y: String,
    pub anchor: Option<String>, // tl/tm/tr/ml/c/mr/bl/bm/br
    pub offset_x: Option<f32>,
    pub offset_y: Option<f32>,
    pub offset_unit: Option<String>, // px/percent
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ImageWatermark {
    pub path: String,
    pub scale: f32, // 1.0 = original size
    pub opacity: f32,
    pub x: String,
    pub y: String,
    pub anchor: Option<String>, // tl/tm/tr/ml/c/mr/bl/bm/br
    pub offset_x: Option<f32>,
    pub offset_y: Option<f32>,
    pub offset_unit: Option<String>, // px/percent
    pub size_mode: Option<String>,   // video_width_ratio/scale
    pub size_value: Option<f32>,
}
