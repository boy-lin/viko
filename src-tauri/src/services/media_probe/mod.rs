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

fn probe_gif(path: &str) -> Result<MediaProbeResult, String> {
    let mut image_probe = probe_image(path)?;

    // Prefer image-kind shape for compatibility, but enrich with AV probe data
    // so animated GIF metadata (duration/frame_rate/stream timing) is available.
    if let Ok(av_probe) = probe_av(path) {
        image_probe.base.duration = av_probe.base.duration;

        for (key, value) in av_probe.base.tags {
            image_probe.base.tags.entry(key).or_insert(value);
        }

        if let (
            MediaProbeDetails::Image(image_details),
            MediaProbeDetails::Video(video_details),
        ) = (&mut image_probe.details, av_probe.details)
        {
            image_details.streams = video_details.streams;
        }
    }

    Ok(image_probe)
}

pub fn probe_media_details(path: &str) -> Result<MediaProbeResult, String> {
    let input_kind = media_common::detect_media_file_type(Path::new(path));
    let is_gif = Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("gif"))
        .unwrap_or(false);

    if is_gif {
        return probe_gif(path);
    }

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
