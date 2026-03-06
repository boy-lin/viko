use ffmpeg::{decoder, format, frame, software};
use ffmpeg_next as ffmpeg;

use crate::media_common;

pub fn resolve_audio_layout(layout: ffmpeg::ChannelLayout, channels: i32) -> ffmpeg::ChannelLayout {
    if layout.is_empty() {
        ffmpeg::ChannelLayout::default(channels)
    } else {
        layout
    }
}

pub fn normalize_decoded_audio_frame(decoded: &mut frame::Audio, fallback_rate: u32) {
    if decoded.channel_layout().is_empty() && decoded.channels() > 0 {
        decoded.set_channel_layout(ffmpeg::ChannelLayout::default(decoded.channels() as i32));
    }
    if decoded.rate() == 0 && fallback_rate > 0 {
        decoded.set_rate(fallback_rate);
    }
}

pub fn build_audio_resampler(
    input_format: format::Sample,
    input_layout: ffmpeg::ChannelLayout,
    input_rate: u32,
    target_format: format::Sample,
    target_layout: ffmpeg::ChannelLayout,
    target_rate: u32,
) -> Result<software::resampling::context::Context, String> {
    software::resampling::context::Context::get(
        input_format,
        input_layout,
        input_rate,
        target_format,
        target_layout,
        target_rate,
    )
    .map_err(|e| format!("Operation failed: {}", e))
}

pub fn build_audio_resampler_from_decoder(
    decoder: &decoder::Audio,
    target_format: format::Sample,
    target_layout: ffmpeg::ChannelLayout,
    target_rate: u32,
) -> Result<software::resampling::context::Context, String> {
    let input_layout = resolve_audio_layout(decoder.channel_layout(), decoder.channels() as i32);
    build_audio_resampler(
        decoder.format(),
        input_layout,
        decoder.rate() as u32,
        target_format,
        target_layout,
        target_rate,
    )
}

pub fn rebuild_audio_resampler_from_frame(
    decoded: &frame::Audio,
    fallback_rate: u32,
    target_format: format::Sample,
    target_layout: ffmpeg::ChannelLayout,
    target_rate: u32,
) -> Result<software::resampling::context::Context, String> {
    let input_layout = resolve_audio_layout(decoded.channel_layout(), decoded.channels() as i32);
    let input_rate = if decoded.rate() > 0 {
        decoded.rate() as u32
    } else {
        fallback_rate
    };
    build_audio_resampler(
        decoded.format(),
        input_layout,
        input_rate,
        target_format,
        target_layout,
        target_rate,
    )
}

pub fn extract_audio_duration(ictx: &ffmpeg::format::context::Input) -> f64 {
    let stream_duration = ictx
        .streams()
        .best(ffmpeg::media::Type::Audio)
        .and_then(|audio_stream| {
            let tb = audio_stream.time_base();
            let dur_ts = audio_stream.duration();
            if dur_ts > 0 {
                Some(dur_ts as f64 * tb.numerator() as f64 / tb.denominator() as f64)
            } else {
                None
            }
        });

    let format_duration = {
        let fmt_dur = ictx.duration();
        if fmt_dur > 0 && fmt_dur != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
            Some(fmt_dur as f64 / ffmpeg::ffi::AV_TIME_BASE as f64)
        } else {
            None
        }
    };

    match (stream_duration, format_duration) {
        (Some(stream), Some(format)) => {
            // 某些容器的时长元数据会偏大，导致 seek 到“看似未结束”位置后快速 EOF。
            // 两者都存在时优先采用更保守的较小值，减少播放时长被高估的问题。
            if (stream - format).abs() > 0.5 {
                stream.min(format)
            } else {
                stream
            }
        }
        (Some(stream), None) => stream,
        (None, Some(format)) => format,
        (None, None) => 0.0,
    }
}

pub fn get_audio_duration_robust(path: &str) -> Result<f64, String> {
    media_common::ensure_ffmpeg_init()?;
    let ictx = media_common::open_input(path)?;
    let metadata_duration = extract_audio_duration(&ictx);
    let packet_tail_duration = estimate_audio_tail_duration_from_packets(path)?;

    let selected = match packet_tail_duration {
        Some(tail) if tail > 0.0 => {
            // 当 metadata 明显大于可解码尾部时，优先采用尾部时长，避免 seek 到“伪剩余区间”后快速 EOF。
            if metadata_duration > 0.0 && metadata_duration - tail > 1.0 {
                tail
            } else if metadata_duration > 0.0 {
                metadata_duration.min(tail.max(metadata_duration - 0.5))
            } else {
                tail
            }
        }
        _ => metadata_duration,
    };

    log::info!(
        "[audio][duration] path={} metadata_duration={} packet_tail_duration={:?} selected={}",
        path,
        metadata_duration,
        packet_tail_duration,
        selected
    );

    Ok(selected)
}

fn estimate_audio_tail_duration_from_packets(path: &str) -> Result<Option<f64>, String> {
    let mut ictx = media_common::open_input(path)?;
    let Some(audio_stream) = ictx.streams().best(ffmpeg::media::Type::Audio) else {
        return Ok(None);
    };
    let audio_index = audio_stream.index();
    let tb = audio_stream.time_base();

    let mut max_end_ts: Option<i64> = None;
    for (stream, packet) in ictx.packets() {
        if stream.index() != audio_index {
            continue;
        }
        let Some(pts) = packet.pts() else {
            continue;
        };
        let packet_duration = packet.duration().max(0);
        let end_ts = pts.saturating_add(packet_duration);
        max_end_ts = Some(max_end_ts.map_or(end_ts, |cur| cur.max(end_ts)));
    }

    let Some(end_ts) = max_end_ts else {
        return Ok(None);
    };
    let end_secs = end_ts as f64 * tb.numerator() as f64 / tb.denominator() as f64;
    Ok(Some(end_secs.max(0.0)))
}
