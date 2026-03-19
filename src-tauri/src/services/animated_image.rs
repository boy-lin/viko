use crate::services::ffmpeg::media_info::MediaDetails;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ImageCompressionParams {
    pub input_path: String,
    pub output_path: String,
    pub quality: Option<u32>,
    pub format: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub color_mode: Option<String>,
    pub colors: Option<u32>,
    pub strip_metadata: Option<bool>,
    pub keep_transparency: Option<bool>,
    pub dpi: Option<f64>,
    pub crop_whitespace: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageCompressionReport {
    pub output_media: MediaDetails,
}
