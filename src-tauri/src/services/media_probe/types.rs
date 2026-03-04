use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MediaKind {
    Video,
    Audio,
    Image,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaseProbe {
    pub path: String,
    pub extension: String,
    pub size: u64,
    pub format_name: Option<String>,
    pub format_long_name: Option<String>,
    pub duration: Option<f64>,
    pub tags: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeStream {
    pub index: usize,
    pub codec_type: String,
    pub codec_name: String,
    pub codec_long_name: Option<String>,
    pub time_base: Option<String>,
    pub pix_fmt: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<String>,
    pub channels: Option<u16>,
    pub sample_rate: Option<u32>,
    pub bit_rate: Option<i64>,
    pub bit_depth: Option<u32>,
    pub bits_per_sample: Option<u32>,
    pub tags: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoProbeDetails {
    pub primary_video_stream_index: Option<usize>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_rate: Option<String>,
    pub pixel_format: Option<String>,
    pub video_codec: Option<String>,
    pub video_bit_rate: Option<i64>,
    pub audio_stream_count: usize,
    pub streams: Vec<ProbeStream>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioProbeDetails {
    pub primary_audio_stream_index: Option<usize>,
    pub codec: Option<String>,
    pub channels: Option<u16>,
    pub sample_rate: Option<u32>,
    pub bit_rate: Option<i64>,
    pub bit_depth: Option<u32>,
    pub bits_per_sample: Option<u32>,
    pub streams: Vec<ProbeStream>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageProbeDetails {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub color_mode: Option<String>,
    pub codec: Option<String>,
    pub bit_depth: Option<u32>,
    pub bits_per_sample: Option<u32>,
    pub dpi_x: Option<f64>,
    pub dpi_y: Option<f64>,
    pub dpi_unit: Option<String>,
    pub quality: Option<u32>,
    pub streams: Vec<ProbeStream>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "details", rename_all = "snake_case")]
pub enum MediaProbeDetails {
    Video(VideoProbeDetails),
    Audio(AudioProbeDetails),
    Image(ImageProbeDetails),
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaProbeResult {
    pub kind: MediaKind,
    pub base: BaseProbe,
    pub details: MediaProbeDetails,
}
