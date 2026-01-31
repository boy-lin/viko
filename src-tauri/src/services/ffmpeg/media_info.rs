use ffmpeg_next as ffmpeg;
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::media_common;
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MediaDetails {
    pub path: String,
    pub extension: String,
    pub format_names: String,
    pub format_long_name: Option<String>,
    pub duration: f64, // seconds
    pub size: u64,     // bytes
    pub streams: Vec<StreamDetails>,
    pub tags: HashMap<String, String>,
    pub stream_tags: Vec<HashMap<String, String>>, // aligned with streams by index
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamDetails {
    pub index: usize,
    pub codec_type: String, // "video", "audio", "subtitle", "data", "attachment"
    pub codec_name: String,
    pub codec_long_name: Option<String>,
    // Video specific
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<String>,
    // Audio specific
    pub channels: Option<u16>,
    pub sample_rate: Option<u32>,
    pub bit_rate: Option<i64>,
}

pub fn get_media_details(path_str: &str) -> Result<MediaDetails, String> {
    media_common::init_ffmpeg()?;

    let path = Path::new(path_str);
    let context = media_common::open_input(path_str)?;

    let duration = context.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64;
    let format_ctx = context.format();
    let format_names = format_ctx.name().to_string();
    let format_long_name = Some(format_ctx.description().to_string());
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    let mut streams = Vec::new();
    let mut stream_tags = Vec::new();

    // Format-level metadata
    let mut tags: HashMap<String, String> = HashMap::new();
    for (k, v) in context.metadata().iter() {
        tags.insert(k.to_string(), v.to_string());
    }

    for stream in context.streams() {
        let codec_params = stream.parameters();
        let medium = codec_params.medium();

        // Skip streams that fail parameter parsing, or handle errors gracefully
        let codec_context =
            match ffmpeg::codec::context::Context::from_parameters(codec_params.clone()) {
                Ok(ctx) => ctx,
                Err(_) => continue,
            };

        let codec_id = codec_params.id();
        let codec_name = codec_id.name().to_string();
        let codec_long_name = None;
        let mut stream_details = StreamDetails {
            index: stream.index(),
            codec_type: format!("{:?}", medium).to_lowercase(),
            codec_name,
            codec_long_name,
            width: None,
            height: None,
            frame_rate: None,
            channels: None,
            sample_rate: None,
            bit_rate: None,
        };

        match medium {
            ffmpeg::media::Type::Video => {
                if let Ok(video) = codec_context.decoder().video() {
                    stream_details.width = Some(video.width());
                    stream_details.height = Some(video.height());

                    let fps = stream.avg_frame_rate();
                    if fps.denominator() > 0 {
                        stream_details.frame_rate = Some(format!(
                            "{:.2}",
                            fps.numerator() as f64 / fps.denominator() as f64
                        ));
                    }
                    stream_details.bit_rate = Some(video.bit_rate() as i64);
                }
            }
            ffmpeg::media::Type::Audio => {
                if let Ok(audio) = codec_context.decoder().audio() {
                    stream_details.channels = Some(audio.channels());
                    stream_details.sample_rate = Some(audio.rate());
                    stream_details.bit_rate = Some(audio.bit_rate() as i64);
                }
            }
            _ => {}
        }

        // Collect stream-level tags for completeness (album art, language, etc.)
        let mut stags: HashMap<String, String> = HashMap::new();
        for (k, v) in stream.metadata().iter() {
            stags.insert(k.to_string(), v.to_string());
        }
        stream_tags.push(stags);

        streams.push(stream_details);
    }

    Ok(MediaDetails {
        path: path_str.to_string(),
        extension,
        format_names,
        format_long_name,
        duration,
        size,
        streams,
        tags,
        stream_tags,
    })
}
