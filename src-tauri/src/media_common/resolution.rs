use ffmpeg_next as ffmpeg;
use ffmpeg::Codec;
use ffmpeg::format;
use ffmpeg::Rational;

/// 解析 "1920x1080" 文本为 (w,h)
pub fn parse_resolution(res: &str) -> Option<(u32, u32)> {
    let parts: Vec<&str> = res.split('x').collect();
    if parts.len() == 2 {
        if let (Ok(w), Ok(h)) = (parts[0].trim().parse::<u32>(), parts[1].trim().parse::<u32>()) {
            if w > 0 && h > 0 {
                return Some((w, h));
            }
        }
    }
    None
}

/// 根据给定宽高或原始尺寸按比例计算目标分辨率。
pub fn scale_dimensions(src_w: u32, src_h: u32, target_w: Option<u32>, target_h: Option<u32>) -> (u32, u32) {
    match (target_w, target_h) {
        (Some(w), Some(h)) => (w.max(1), h.max(1)),
        (Some(w), None) => {
            let h = ((w as f64 * src_h as f64 / src_w as f64).round() as u32).max(1);
            (w.max(1), h)
        }
        (None, Some(h)) => {
            let w = ((h as f64 * src_w as f64 / src_h as f64).round() as u32).max(1);
            (w, h.max(1))
        }
        _ => (src_w, src_h),
    }
}

/// 按字符串解析分辨率；"original" 则返回原始尺寸。
pub fn resolve_resolution(src_w: u32, src_h: u32, res: Option<&str>) -> (u32, u32) {
    if let Some(r) = res {
        if r.eq_ignore_ascii_case("original") {
            (src_w, src_h)
        } else {
            parse_resolution(r).unwrap_or((src_w, src_h))
        }
    } else {
        (src_w, src_h)
    }
}

/// 解析宽高比字符串 "16:9"
pub fn parse_aspect_ratio(ar: Option<&str>) -> Option<Rational> {
    ar.and_then(|s| {
        let parts: Vec<&str> = s.split(':').collect();
        if parts.len() == 2 {
            if let (Ok(w), Ok(h)) = (parts[0].trim().parse::<i32>(), parts[1].trim().parse::<i32>()) {
                if w > 0 && h > 0 {
                    return Some(Rational(w, h));
                }
            }
        }
        None
    })
}

/// 根据位深和是否硬件加速选择像素格式。
pub fn pick_pixel_format(bit_depth: Option<u32>, use_hw: bool) -> format::Pixel {
    match (bit_depth, use_hw) {
        (Some(10), true) => format::Pixel::P010LE,
        (Some(10), false) => format::Pixel::YUV420P10LE,
        (Some(12), _) => format::Pixel::YUV420P12LE,
        (_, true) => format::Pixel::NV12,
        _ => format::Pixel::YUV420P,
    }
}

fn codec_supported_pixel_formats(codec: Codec) -> Vec<format::Pixel> {
    unsafe {
        let mut formats = Vec::new();
        let codec_ptr = codec.as_ptr();
        if codec_ptr.is_null() {
            return formats;
        }
        let pix_fmts = (*codec_ptr).pix_fmts;
        if pix_fmts.is_null() {
            return formats;
        }
        let mut idx = 0usize;
        loop {
            let pix = *pix_fmts.add(idx);
            if pix == ffmpeg::ffi::AVPixelFormat::AV_PIX_FMT_NONE {
                break;
            }
            formats.push(format::Pixel::from(pix));
            idx += 1;
        }
        formats
    }
}

/// Choose a pixel format based on bit depth/hw, but fall back to codec-supported formats.
pub fn pick_pixel_format_for_codec(
    bit_depth: Option<u32>,
    use_hw: bool,
    codec: Codec,
) -> format::Pixel {
    let preferred = pick_pixel_format(bit_depth, use_hw);
    let supported = codec_supported_pixel_formats(codec);
    if supported.is_empty() {
        return preferred;
    }
    if supported.iter().any(|fmt| *fmt == preferred) {
        return preferred;
    }

    let fallbacks = [
        format::Pixel::YUV420P,
        format::Pixel::NV12,
        format::Pixel::YUV422P,
        format::Pixel::YUV444P,
    ];
    for candidate in fallbacks {
        if supported.iter().any(|fmt| *fmt == candidate) {
            return candidate;
        }
    }

    supported[0]
}
