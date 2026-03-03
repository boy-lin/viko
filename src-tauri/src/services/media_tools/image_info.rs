use exif::{In, Reader as ExifReader, Tag, Value};
use image::GenericImageView;
use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use crate::services::ffmpeg::media_info::{MediaDetails, StreamDetails};

fn map_color_mode_to_pix_fmt(color: image::ColorType) -> String {
    match color {
        image::ColorType::L8 => "gray8".to_string(),
        image::ColorType::La8 => "graya8".to_string(),
        image::ColorType::Rgb8 => "rgb24".to_string(),
        image::ColorType::Rgba8 => "rgba".to_string(),
        image::ColorType::L16 => "gray16le".to_string(),
        image::ColorType::La16 => "graya16le".to_string(),
        image::ColorType::Rgb16 => "rgb48le".to_string(),
        image::ColorType::Rgba16 => "rgba64le".to_string(),
        image::ColorType::Rgb32F => "rgbf32le".to_string(),
        image::ColorType::Rgba32F => "rgbaf32le".to_string(),
        _ => format!("{:?}", color).to_lowercase(),
    }
}

fn format_name(format: image::ImageFormat) -> String {
    match format {
        image::ImageFormat::Png => "png",
        image::ImageFormat::Jpeg => "jpeg",
        image::ImageFormat::Gif => "gif",
        image::ImageFormat::WebP => "webp",
        image::ImageFormat::Pnm => "pnm",
        image::ImageFormat::Tiff => "tiff",
        image::ImageFormat::Tga => "tga",
        image::ImageFormat::Dds => "dds",
        image::ImageFormat::Bmp => "bmp",
        image::ImageFormat::Ico => "ico",
        image::ImageFormat::Hdr => "hdr",
        image::ImageFormat::OpenExr => "openexr",
        image::ImageFormat::Farbfeld => "farbfeld",
        image::ImageFormat::Avif => "avif",
        image::ImageFormat::Qoi => "qoi",
        _ => "image",
    }
    .to_string()
}

fn rational_to_f64(rational: exif::Rational) -> Option<f64> {
    if rational.denom == 0 {
        return None;
    }
    Some(rational.num as f64 / rational.denom as f64)
}

fn exif_value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::Ascii(items) => items
            .first()
            .and_then(|bytes| String::from_utf8(bytes.clone()).ok())
            .map(|text| text.trim_matches('\0').to_string())
            .filter(|text| !text.is_empty()),
        Value::Rational(items) => items
            .first()
            .and_then(|value| rational_to_f64(*value))
            .map(|number| format!("{:.4}", number)),
        Value::SRational(items) => items
            .first()
            .and_then(|value| {
                if value.denom == 0 {
                    None
                } else {
                    Some(value.num as f64 / value.denom as f64)
                }
            })
            .map(|number| format!("{:.4}", number)),
        Value::Short(items) => items.first().map(|value| value.to_string()),
        Value::SShort(items) => items.first().map(|value| value.to_string()),
        Value::Long(items) => items.first().map(|value| value.to_string()),
        Value::SLong(items) => items.first().map(|value| value.to_string()),
        Value::Byte(items) => items.first().map(|value| value.to_string()),
        Value::SByte(items) => items.first().map(|value| value.to_string()),
        Value::Float(items) => items.first().map(|value| format!("{:.4}", value)),
        Value::Double(items) => items.first().map(|value| format!("{:.4}", value)),
        Value::Undefined(_, _) => None,
        Value::Unknown(_, _, _) => None,
    }
}

fn read_exif_tags(path_str: &str) -> HashMap<String, String> {
    let mut tags = HashMap::new();
    let file = match File::open(path_str) {
        Ok(file) => file,
        Err(_) => return tags,
    };
    let mut reader = BufReader::new(file);
    let exif = match ExifReader::new().read_from_container(&mut reader) {
        Ok(exif) => exif,
        Err(_) => return tags,
    };

    for field in exif.fields() {
        if let Some(text) = exif_value_to_string(&field.value) {
            let key = format!("exif.{}", field.tag);
            tags.insert(key, text);
        }
    }

    if let Some(field) = exif.get_field(Tag::XResolution, In::PRIMARY) {
        if let Value::Rational(values) = &field.value {
            if let Some(value) = values.first().and_then(|item| rational_to_f64(*item)) {
                tags.insert("dpi_x".to_string(), format!("{:.2}", value));
            }
        }
    }
    if let Some(field) = exif.get_field(Tag::YResolution, In::PRIMARY) {
        if let Value::Rational(values) = &field.value {
            if let Some(value) = values.first().and_then(|item| rational_to_f64(*item)) {
                tags.insert("dpi_y".to_string(), format!("{:.2}", value));
            }
        }
    }
    if let Some(field) = exif.get_field(Tag::ResolutionUnit, In::PRIMARY) {
        if let Some(unit_code) = match &field.value {
            Value::Short(values) => values.first().copied(),
            Value::Long(values) => values.first().map(|value| *value as u16),
            _ => None,
        } {
            let unit = match unit_code {
                2 => "inch",
                3 => "cm",
                _ => "unknown",
            };
            tags.insert("dpi_unit".to_string(), unit.to_string());
        }
    }

    tags
}

pub fn get_image_details(path_str: &str) -> Result<MediaDetails, String> {
    let path = Path::new(path_str);
    let size = std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);

    let mut reader = image::ImageReader::open(path_str)
        .map_err(|error| format!("无法打开图片: {}", error))?;
    reader = reader.with_guessed_format()
        .map_err(|error| format!("无法识别图片格式: {}", error))?;
    let guessed_format = reader.format();
    let dynamic = reader
        .decode()
        .map_err(|error| format!("无法解码图片: {}", error))?;

    let (width, height) = dynamic.dimensions();
    let color = dynamic.color();
    let channel_count = color.channel_count() as u32;
    let bits_per_pixel = color.bits_per_pixel() as u32;
    let bits_per_sample = if channel_count > 0 {
        Some(bits_per_pixel / channel_count)
    } else {
        None
    };

    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|text| text.to_lowercase())
        .unwrap_or_default();
    let format_names = guessed_format
        .map(format_name)
        .or_else(|| {
            if extension.is_empty() {
                None
            } else {
                Some(extension.clone())
            }
        })
        .unwrap_or_else(|| "image".to_string());

    let stream = StreamDetails {
        index: 0,
        codec_type: "video".to_string(),
        codec_name: format_names.clone(),
        codec_long_name: None,
        time_base: None,
        pix_fmt: Some(map_color_mode_to_pix_fmt(color)),
        width: Some(width),
        height: Some(height),
        frame_rate: None,
        channels: None,
        sample_rate: None,
        bit_rate: None,
        bit_depth: bits_per_sample,
        bits_per_sample,
    };

    let tags = read_exif_tags(path_str);

    Ok(MediaDetails {
        path: path_str.to_string(),
        extension,
        format_names: format_names.clone(),
        format_long_name: Some(format_names),
        duration: 0.0,
        size,
        streams: vec![stream],
        tags,
        stream_tags: Vec::new(),
    })
}
