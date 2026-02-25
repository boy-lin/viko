use ffmpeg::{codec, format};
use ffmpeg_next as ffmpeg;

/// 选择视频编码器，支持软编码/简单硬件映射。
/// 返回 ffmpeg 编码器句柄，若未找到则返回 None。
pub fn select_video_encoder(name: Option<&str>, use_hw: bool) -> Option<ffmpeg::Codec> {
    let fallback = "h264";
    let requested = name.unwrap_or(fallback).to_lowercase();

    // 映射常见编码器名称到 ffmpeg codec 名称
    // 如果请求的是通用名称 "h264" 或 "hevc" 且启用了硬件加速，尝试优先查找硬件编码器
    // 如果找不到硬件编码器，再回退到软件编码器
    let candidates = match (requested.as_str(), use_hw) {
        ("h264", true) | ("avc", true) => {
            if cfg!(target_os = "macos") {
                vec!["h264_videotoolbox", "libx264"]
            } else if cfg!(target_os = "windows") {
                vec!["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf", "libx264"]
            } else {
                vec!["h264_nvenc", "h264_qsv", "h264_vaapi", "libx264"]
            }
        }
        ("h264", false) | ("avc", false) => vec!["libx264"],

        ("h265", true) | ("hevc", true) => {
            if cfg!(target_os = "macos") {
                vec!["hevc_videotoolbox", "libx265"]
            } else if cfg!(target_os = "windows") {
                vec!["hevc_nvenc", "hevc_qsv", "hevc_amf", "libx265"]
            } else {
                vec!["hevc_nvenc", "hevc_qsv", "hevc_vaapi", "libx265"]
            }
        }
        ("h265", false) | ("hevc", false) => vec!["libx265"],

        ("vp9", _) => vec!["libvpx-vp9"],
        ("av1", _) => vec!["libaom-av1", "libsvtav1", "av1_nvenc", "av1_qsv"],

        // 直接传 ffmpeg codec 名称 (e.g. "mpeg4", "libx264")
        (other, _) => vec![other],
    };

    for candidate in candidates {
        if let Some(codec) = ffmpeg::encoder::find_by_name(candidate) {
            return Some(codec);
        }
    }

    println!("Failed to find encoder for {}", requested);

    // 最后的通用回退
    ffmpeg::encoder::find(codec::Id::H264)
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

pub fn pick_sample_format(codec: &ffmpeg::Codec, preferred: format::Sample) -> format::Sample {
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
