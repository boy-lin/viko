use ffmpeg_next as ffmpeg;
use ffmpeg::codec;

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
