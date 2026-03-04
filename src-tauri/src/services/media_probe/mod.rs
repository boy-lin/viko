pub mod types;
mod video;

use crate::media_common::{self, MediaFileType};
use crate::services::ffmpeg::media_info;
use crate::services::media_tools::image_info;
use std::path::Path;
pub use types::{BaseProbe, MediaKind, MediaProbeDetails, MediaProbeResult, ProbeStream};

fn detect_kind_from_streams(details: &media_info::MediaDetails) -> MediaKind {
    let has_video = details
        .streams
        .iter()
        .any(|stream| stream.codec_type == "video");
    let has_audio = details
        .streams
        .iter()
        .any(|stream| stream.codec_type == "audio");

    if has_video {
        MediaKind::Video
    } else if has_audio {
        MediaKind::Audio
    } else {
        MediaKind::Unknown
    }
}

fn probe_av(path: &str) -> Result<MediaProbeResult, String> {
    let details = media_info::get_media_details(path)?;
    match detect_kind_from_streams(&details) {
        MediaKind::Video => Ok(video::probe_video_from_media_details(details)),
        MediaKind::Audio => Ok(video::probe_audio_from_media_details(details)),
        _ => Ok(video::probe_video_from_media_details(details)),
    }
}

fn probe_image(path: &str) -> Result<MediaProbeResult, String> {
    let details = image_info::get_image_details(path)?;
    Ok(video::probe_image_from_media_details(details))
}

pub fn probe_media_details(path: &str) -> Result<MediaProbeResult, String> {
    let input_kind = media_common::detect_media_file_type(Path::new(path));
    match input_kind {
        MediaFileType::Image => probe_image(path).or_else(|_| probe_av(path)),
        MediaFileType::Video => probe_av(path).or_else(|_| probe_image(path)),
        MediaFileType::Audio => probe_av(path).or_else(|_| probe_image(path)),
        MediaFileType::Unknown => probe_av(path).or_else(|_| probe_image(path)),
    }
}

pub fn probe_media_details_batch(paths: Vec<String>) -> Vec<Result<MediaProbeResult, String>> {
    paths
        .into_iter()
        .map(|path| probe_media_details(path.as_str()))
        .collect()
}
