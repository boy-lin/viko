use ffmpeg::{codec, encoder, format, packet, Rational};
use ffmpeg_next as ffmpeg;
use crate::media_common;

fn fourcc(tag: &[u8; 4]) -> u32 {
    (tag[0] as u32) | ((tag[1] as u32) << 8) | ((tag[2] as u32) << 16) | ((tag[3] as u32) << 24)
}

pub fn rational_to_rate_string(rate: Rational) -> Option<String> {
    if rate.denominator() == 0 {
        return None;
    }
    Some(format!(
        "{:.2}",
        rate.numerator() as f64 / rate.denominator() as f64
    ))
}

pub fn needs_hevc_hvc1_tag(codec_id: codec::Id, output_format: &str) -> bool {
    if codec_id != codec::Id::HEVC {
        return false;
    }
    matches!(output_format.to_ascii_lowercase().as_str(), "mov" | "mp4" | "m4v")
}

pub fn force_hevc_hvc1_tag(
    ost: &mut format::stream::StreamMut<'_>,
    codec_id: codec::Id,
    output_format: &str,
) {
    if !needs_hevc_hvc1_tag(codec_id, output_format) {
        return;
    }

    unsafe {
        (*ost.parameters().as_mut_ptr()).codec_tag = fourcc(b"hvc1");
    }
    log::info!(
        "video_transcode forcing HEVC codec_tag to hvc1 for container={}",
        output_format
    );
}

pub fn is_hardware_video_encoder(codec_name: &str) -> bool {
    codec_name.contains("videotoolbox")
        || codec_name.contains("_nvenc")
        || codec_name.contains("_qsv")
        || codec_name.contains("_vaapi")
        || codec_name.contains("_amf")
}

pub fn calc_video_bitrate_from_kbps(
    decoder_bitrate: i64,
    requested_kbps: Option<u32>,
    default_bps: i64,
    min_bps: i64,
) -> usize {
    let base = if let Some(br) = requested_kbps {
        (br as i64) * 1000
    } else if decoder_bitrate > 0 {
        decoder_bitrate
    } else {
        default_bps
    };
    base.max(min_bps) as usize
}

pub fn force_monotonic_ts_in_ost_tb(
    encoded: &mut packet::Packet,
    last_mux_dts_ost: &mut i64,
    next_mux_ts_ost: &mut i64,
    frame_step_ost: i64,
    max_jump_factor: i64,
) {
    let raw_dts = encoded.dts().or(encoded.pts()).unwrap_or(*next_mux_ts_ost);
    let expected_next = if *last_mux_dts_ost >= 0 {
        *last_mux_dts_ost + frame_step_ost
    } else {
        *next_mux_ts_ost
    };
    let max_allowed = expected_next + frame_step_ost * max_jump_factor.max(1);
    let mut dts = raw_dts;
    if dts <= *last_mux_dts_ost || dts > max_allowed {
        dts = expected_next;
    }
    let mut pts = encoded.pts().unwrap_or(dts);
    if pts < dts {
        pts = dts;
    }

    encoded.set_dts(Some(dts));
    encoded.set_pts(Some(pts));

    *last_mux_dts_ost = dts;
    *next_mux_ts_ost = dts + frame_step_ost;
}

pub fn pick_video_encoder_for_compress(
    requested: Option<&str>,
    use_hw: bool,
    fallback_id: codec::Id,
) -> Option<ffmpeg::Codec> {
    let req = requested.unwrap_or("h264").to_ascii_lowercase();

    if req == "h264" || req == "avc" {
        if let Some(codec) = encoder::find_by_name("libx264") {
            return Some(codec);
        }
    }
    if req == "h265" || req == "hevc" {
        if let Some(codec) = encoder::find_by_name("libx265") {
            return Some(codec);
        }
    }

    media_common::select_video_encoder(requested, use_hw)
        .or_else(|| encoder::find(fallback_id))
        .or_else(|| encoder::find_by_name(fallback_id.name()))
}

pub fn pick_audio_encoder_for_compress(
    requested_codec_name: Option<&str>,
    fallback_id: codec::Id,
    output_ext: &str,
) -> Option<ffmpeg::Codec> {
    let output_ext = output_ext.to_ascii_lowercase();
    let is_webm = output_ext == "webm";

    if let Some(name) = requested_codec_name {
        if is_webm {
            let lowered = name.to_ascii_lowercase();
            let supported = matches!(lowered.as_str(), "libopus" | "opus" | "libvorbis" | "vorbis");
            if !supported {
                log::warn!(
                    "compress_video audio codec '{}' incompatible with webm container, fallback to webm-compatible codec",
                    name
                );
            } else if let Some(codec) = encoder::find_by_name(name) {
                return Some(codec);
            }
        } else if let Some(codec) = encoder::find_by_name(name) {
            return Some(codec);
        }
    }

    let mut candidates: Vec<&str> = Vec::new();
    if is_webm {
        candidates.extend(["libopus", "opus", "libvorbis", "vorbis"]);
    }

    if let Some(name) = requested_codec_name {
        if let Some(codec) = encoder::find_by_name(name) {
            return Some(codec);
        }
    }

    match fallback_id.name() {
        "mp3" => candidates.extend(["libmp3lame", "libshine", "mp3"]),
        "aac" => candidates.extend(["aac", "libfdk_aac", "aac_at"]),
        _ => {}
    }
    candidates.push(fallback_id.name());

    for name in candidates {
        if let Some(codec) = encoder::find_by_name(name) {
            return Some(codec);
        }
    }

    encoder::find(fallback_id).or_else(|| encoder::find_by_name(fallback_id.name()))
}
