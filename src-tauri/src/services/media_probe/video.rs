use super::types::{
    AudioProbeDetails, BaseProbe, MediaKind, MediaProbeDetails, MediaProbeResult, ProbeStream,
    VideoProbeDetails,
};
use crate::services::ffmpeg::media_info::{MediaDetails, StreamDetails};
use std::collections::HashMap;

fn parse_f64_tag(tags: &HashMap<String, String>, key: &str) -> Option<f64> {
    tags.get(key).and_then(|value| value.parse::<f64>().ok())
}

fn parse_u32_tag(tags: &HashMap<String, String>, key: &str) -> Option<u32> {
    tags.get(key).and_then(|value| value.parse::<u32>().ok())
}

fn map_stream(stream: &StreamDetails, stream_tags: HashMap<String, String>) -> ProbeStream {
    ProbeStream {
        index: stream.index,
        codec_type: stream.codec_type.clone(),
        codec_name: stream.codec_name.clone(),
        codec_long_name: stream.codec_long_name.clone(),
        time_base: stream.time_base.clone(),
        pix_fmt: stream.pix_fmt.clone(),
        width: stream.width,
        height: stream.height,
        frame_rate: stream.frame_rate.clone(),
        channels: stream.channels,
        sample_rate: stream.sample_rate,
        bit_rate: stream.bit_rate,
        bit_depth: stream.bit_depth,
        bits_per_sample: stream.bits_per_sample,
        tags: stream_tags,
    }
}

fn map_base(input: &MediaDetails) -> BaseProbe {
    BaseProbe {
        path: input.path.clone(),
        extension: input.extension.clone(),
        size: input.size,
        format_name: Some(input.format_names.clone()),
        format_long_name: input.format_long_name.clone(),
        duration: Some(input.duration),
        tags: input.tags.clone(),
    }
}

pub(super) fn probe_video_from_media_details(input: MediaDetails) -> MediaProbeResult {
    let streams: Vec<ProbeStream> = input
        .streams
        .iter()
        .enumerate()
        .map(|(i, stream)| {
            let tags = input.stream_tags.get(i).cloned().unwrap_or_default();
            map_stream(stream, tags)
        })
        .collect();

    let primary_video = streams
        .iter()
        .find(|stream| stream.codec_type == "video")
        .cloned();
    let audio_stream_count = streams
        .iter()
        .filter(|stream| stream.codec_type == "audio")
        .count();

    MediaProbeResult {
        kind: MediaKind::Video,
        base: map_base(&input),
        details: MediaProbeDetails::Video(VideoProbeDetails {
            primary_video_stream_index: primary_video.as_ref().map(|stream| stream.index),
            width: primary_video.as_ref().and_then(|stream| stream.width),
            height: primary_video.as_ref().and_then(|stream| stream.height),
            frame_rate: primary_video.as_ref().and_then(|stream| stream.frame_rate.clone()),
            pixel_format: primary_video.as_ref().and_then(|stream| stream.pix_fmt.clone()),
            video_codec: primary_video.as_ref().map(|stream| stream.codec_name.clone()),
            video_bit_rate: primary_video.as_ref().and_then(|stream| stream.bit_rate),
            audio_stream_count,
            streams,
        }),
    }
}

pub(super) fn probe_audio_from_media_details(input: MediaDetails) -> MediaProbeResult {
    let streams: Vec<ProbeStream> = input
        .streams
        .iter()
        .enumerate()
        .map(|(i, stream)| {
            let tags = input.stream_tags.get(i).cloned().unwrap_or_default();
            map_stream(stream, tags)
        })
        .collect();

    let primary_audio = streams
        .iter()
        .find(|stream| stream.codec_type == "audio")
        .cloned();

    MediaProbeResult {
        kind: MediaKind::Audio,
        base: map_base(&input),
        details: MediaProbeDetails::Audio(AudioProbeDetails {
            primary_audio_stream_index: primary_audio.as_ref().map(|stream| stream.index),
            codec: primary_audio.as_ref().map(|stream| stream.codec_name.clone()),
            channels: primary_audio.as_ref().and_then(|stream| stream.channels),
            sample_rate: primary_audio.as_ref().and_then(|stream| stream.sample_rate),
            bit_rate: primary_audio.as_ref().and_then(|stream| stream.bit_rate),
            bit_depth: primary_audio.as_ref().and_then(|stream| stream.bit_depth),
            bits_per_sample: primary_audio.as_ref().and_then(|stream| stream.bits_per_sample),
            streams,
        }),
    }
}

pub(super) fn probe_image_from_media_details(input: MediaDetails) -> MediaProbeResult {
    let streams: Vec<ProbeStream> = input
        .streams
        .iter()
        .enumerate()
        .map(|(i, stream)| {
            let tags = input.stream_tags.get(i).cloned().unwrap_or_default();
            map_stream(stream, tags)
        })
        .collect();

    let primary = streams.first().cloned();
    let dpi_x = parse_f64_tag(&input.tags, "dpi_x");
    let dpi_y = parse_f64_tag(&input.tags, "dpi_y");
    let dpi_unit = input.tags.get("dpi_unit").cloned();
    let quality = parse_u32_tag(&input.tags, "quality");

    MediaProbeResult {
        kind: MediaKind::Image,
        base: BaseProbe {
            path: input.path.clone(),
            extension: input.extension.clone(),
            size: input.size,
            format_name: Some(input.format_names.clone()),
            format_long_name: input.format_long_name.clone(),
            duration: None,
            tags: input.tags.clone(),
        },
        details: MediaProbeDetails::Image(super::types::ImageProbeDetails {
            width: primary.as_ref().and_then(|stream| stream.width),
            height: primary.as_ref().and_then(|stream| stream.height),
            color_mode: primary.as_ref().and_then(|stream| stream.pix_fmt.clone()),
            codec: primary.as_ref().map(|stream| stream.codec_name.clone()),
            bit_depth: primary.as_ref().and_then(|stream| stream.bit_depth),
            bits_per_sample: primary.as_ref().and_then(|stream| stream.bits_per_sample),
            dpi_x,
            dpi_y,
            dpi_unit,
            quality,
            streams,
        }),
    }
}
