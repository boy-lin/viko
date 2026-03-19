pub mod types;
mod video;

use crate::media_common::{self, MediaFileType};
use crate::services::ffmpeg::media_info;
use crate::services::media_tools::image_info;
use crate::services::media_tools::thumbnail::{self, ThumbnailOptions, ThumbnailResult};
use ffmpeg_next as ffmpeg;
use std::path::Path;
pub use types::{BaseProbe, MediaKind, MediaProbeDetails, MediaProbeResult, ProbeStream};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaCardResult {
    pub probe: MediaProbeResult,
    pub thumbnail: Option<ThumbnailResult>,
}

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

fn probe_video_card(path: &str, options: Option<ThumbnailOptions>) -> Result<MediaCardResult, String> {
    media_common::init_ffmpeg()?;
    let input_path = Path::new(path);
    let mut ictx = media_common::open_input(path)?;
    let details = media_info::collect_media_details_from_context(path, &ictx)?;
    let probe = match detect_kind_from_streams(&details) {
        MediaKind::Video => video::probe_video_from_media_details(details),
        MediaKind::Audio => video::probe_audio_from_media_details(details),
        _ => video::probe_video_from_media_details(details),
    };

    let requested_width = options.as_ref().and_then(|value| value.width);
    let requested_height = options.as_ref().and_then(|value| value.height);
    let fit_mode = options
        .as_ref()
        .and_then(|value| value.fit_mode.as_deref())
        .unwrap_or("contain")
        .to_ascii_lowercase();
    let cache_key = thumbnail::build_thumbnail_cache_key(
        input_path,
        requested_width,
        requested_height,
        &fit_mode,
    );

    let thumbnail = if let Some(stream) = ictx.streams().best(ffmpeg::media::Type::Video) {
        let stream_index = stream.index();
        let stream_params = stream.parameters().to_owned();
        let decoder_ctx = ffmpeg::codec::context::Context::from_parameters(stream_params)
            .map_err(|e| format!("Decoder context failed: {}", e))?;
        let mut decoder = decoder_ctx
            .decoder()
            .video()
            .map_err(|e| format!("Decoder failed: {}", e))?;
        let source_width = decoder.width().max(1);
        let source_height = decoder.height().max(1);

        let mut scaler = if decoder.width() > 0 && decoder.height() > 0 {
            ffmpeg::software::scaling::context::Context::get(
                decoder.format(),
                decoder.width(),
                decoder.height(),
                ffmpeg::format::Pixel::RGB24,
                decoder.width(),
                decoder.height(),
                ffmpeg::software::scaling::flag::Flags::BILINEAR,
            )
            .ok()
        } else {
            None
        };

        let mut result = None;
        for (stream, packet) in ictx.packets() {
            if stream.index() != stream_index {
                continue;
            }

            decoder
                .send_packet(&packet)
                .map_err(|e| format!("Send packet failed: {}", e))?;

            let mut decoded = ffmpeg::frame::Video::empty();
            if decoder.receive_frame(&mut decoded).is_ok() {
                let mut rgb_frame = ffmpeg::frame::Video::empty();
                let Some(scaler) = &mut scaler else {
                    break;
                };
                scaler
                    .run(&decoded, &mut rgb_frame)
                    .map_err(|e| format!("Scaling failed: {}", e))?;
                let img_buffer = media_common::frame_to_rgb_image(&rgb_frame)?;
                result = Some(thumbnail::build_thumbnail_result(
                    img_buffer,
                    requested_width,
                    requested_height,
                    fit_mode.as_str(),
                    &cache_key,
                    source_width,
                    source_height,
                )?);
                break;
            }
        }
        result
    } else {
        None
    };

    Ok(MediaCardResult { probe, thumbnail })
}

pub fn probe_media_card(path: &str, options: Option<ThumbnailOptions>) -> Result<MediaCardResult, String> {
    let input_kind = media_common::detect_media_file_type(Path::new(path));
    match input_kind {
        MediaFileType::Video | MediaFileType::Audio | MediaFileType::Unknown => {
            probe_video_card(path, options)
        }
        MediaFileType::Image => Ok(MediaCardResult {
            probe: probe_media_details(path)?,
            thumbnail: thumbnail::generate_thumbnail(path, options)?,
        }),
    }
}

pub fn probe_media_details_batch(paths: Vec<String>) -> Vec<Result<MediaProbeResult, String>> {
    paths
        .into_iter()
        .map(|path| probe_media_details(path.as_str()))
        .collect()
}
