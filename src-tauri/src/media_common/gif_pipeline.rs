use ffmpeg::format;
use ffmpeg::Rational;
use ffmpeg_next as ffmpeg;

pub fn pick_pixel_format(color_mode: Option<&str>) -> format::Pixel {
    let mode = color_mode.unwrap_or("rgb").to_lowercase();
    if mode == "grayscale" || mode == "gray" {
        format::Pixel::GRAY8
    } else {
        format::Pixel::RGB8
    }
}

pub fn compute_fps(frame_delay: Option<u32>, frame_rate: Option<f32>) -> (f32, Rational, i64) {
    if let Some(fps) = frame_rate {
        let fps = fps.max(1.0);
        (fps, Rational(1, fps.round() as i32), 1)
    } else if let Some(delay_ms) = frame_delay {
        let delay = delay_ms.max(1);
        let fps = 1000.0 / delay as f32;
        let g = crate::media_common::gcd(1000, delay);
        let num = 1000 / g;
        let den = delay / g;
        (fps, Rational(den as i32, num as i32), 1)
    } else {
        let fps = frame_rate.unwrap_or(10.0).max(1.0);
        (fps, Rational(1, fps.round() as i32), 1)
    }
}

pub fn dither_from_quality(quality: u32) -> (&'static str, &'static str) {
    if quality >= 80 {
        ("bayer", "3")
    } else if quality >= 50 {
        ("floyd_steinberg", "0")
    } else {
        ("none", "0")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pick_pixel_format_defaults_to_rgb() {
        assert_eq!(pick_pixel_format(None), format::Pixel::RGB8);
        assert_eq!(pick_pixel_format(Some("rgb")), format::Pixel::RGB8);
    }

    #[test]
    fn test_pick_pixel_format_gray() {
        assert_eq!(pick_pixel_format(Some("grayscale")), format::Pixel::GRAY8);
        assert_eq!(pick_pixel_format(Some("gray")), format::Pixel::GRAY8);
    }

    #[test]
    fn test_compute_fps_from_frame_delay() {
        let (fps, tb, step) = compute_fps(Some(100), None);
        assert!((fps - 10.0).abs() < f32::EPSILON);
        assert_eq!(tb, Rational(1, 10));
        assert_eq!(step, 1);
    }

    #[test]
    fn test_compute_fps_from_frame_rate() {
        let (fps, tb, step) = compute_fps(None, Some(24.0));
        assert!((fps - 24.0).abs() < f32::EPSILON);
        assert_eq!(tb, Rational(1, 24));
        assert_eq!(step, 1);
    }

    #[test]
    fn test_compute_fps_prefers_frame_rate_over_delay() {
        let (fps, tb, step) = compute_fps(Some(10), Some(20.0));
        assert!((fps - 20.0).abs() < f32::EPSILON);
        assert_eq!(tb, Rational(1, 20));
        assert_eq!(step, 1);
    }

    #[test]
    fn test_dither_from_quality() {
        assert_eq!(dither_from_quality(90), ("bayer", "3"));
        assert_eq!(dither_from_quality(60), ("floyd_steinberg", "0"));
        assert_eq!(dither_from_quality(30), ("none", "0"));
    }
}
