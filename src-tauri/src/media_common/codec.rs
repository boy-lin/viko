use ffmpeg_next as ffmpeg;
use ffmpeg::{codec, format};

/// 选择视频编码器，支持软编码/简单硬件映射。
/// 返回 ffmpeg 编码器句柄，若未找到则返回 None。
pub fn select_video_encoder(name: Option<&str>, use_hw: bool) -> Option<ffmpeg::Codec> {
    let fallback = "h264";
    let requested = name.unwrap_or(fallback).to_lowercase();

    // 映射常见编码器名称到 ffmpeg codec 名称
    let mapped = match (requested.as_str(), use_hw) {
        ("h264", true) | ("avc", true) => {
            if cfg!(target_os = "macos") {
                "h264_videotoolbox"
            } else {
                "libx264"
            }
        }
        ("h264", false) | ("avc", false) => "libx264",
        ("h265", true) | ("hevc", true) => {
            if cfg!(target_os = "macos") {
                "hevc_videotoolbox"
            } else {
                "libx265"
            }
        }
        ("h265", false) | ("hevc", false) => "libx265",
        ("vp9", _) => "libvpx-vp9",
        ("av1", _) => "libaom-av1",
        // 直接传 ffmpeg codec 名称
        (other, _) => other,
    };

    ffmpeg::encoder::find_by_name(mapped)
        .or_else(|| ffmpeg::encoder::find(codec::Id::H264))
}

pub fn pick_sample_rate(codec: &ffmpeg::Codec, desired: u32, input: u32) -> u32 {
    if let Ok(audio) = codec.audio() {
        if let Some(rates) = audio.rates() {
            // Find exact match or closest
            // Simply check if desired is supported
            for rate in rates {
                if rate as u32 == desired {
                    return desired;
                }
            }
            // If desired not found, verify input
            for rate in audio.rates().unwrap() {
                if rate as u32 == input {
                    return input;
                }
            }
            // Fallback to first supported
            return audio.rates().unwrap().next().unwrap() as u32;
        }
    }
    // If no restrictions, use desired
    desired
}

pub fn pick_channel_layout(
    codec: &ffmpeg::Codec,
    desired: Option<ffmpeg::ChannelLayout>,
    input: ffmpeg::ChannelLayout,
) -> ffmpeg::ChannelLayout {
    if let Ok(audio) = codec.audio() {
        if let Some(layouts) = audio.channel_layouts() {
            if let Some(des) = desired {
                for layout in layouts {
                    if layout == des {
                        return des;
                    }
                }
            }
            for layout in audio.channel_layouts().unwrap() {
                if layout == input {
                    return input;
                }
            }
            return audio.channel_layouts().unwrap().next().unwrap();
        }
    }
    desired.unwrap_or(input)
}

pub fn pick_sample_format(
    codec: &ffmpeg::Codec,
    preferred: format::Sample,
) -> format::Sample {
    if let Ok(audio) = codec.audio() {
        if let Some(formats) = audio.formats() {
            for fmt in formats {
                if fmt == preferred {
                    return preferred;
                }
            }
            // Fallback to commonly supported or first
            // Prefer explicit fallback logic if needed, but taking first is safe-ish
            return audio.formats().unwrap().next().unwrap();
        }
    }
    preferred
}
