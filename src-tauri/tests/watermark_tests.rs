#[cfg(test)]
mod tests {
    use audio_video_kit_lib::events::MockEmitter;
    use audio_video_kit_lib::video_converter::{convert_video, VideoConversionParams};
    use audio_video_kit_lib::watermark::{WatermarkConfig, TextWatermark, ImageWatermark};
    use std::fs;
    use std::path::PathBuf;
    use image::{RgbaImage, Rgba};

    fn get_test_output_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("watermark_tests");
        if !dir.exists() {
            let _ = fs::create_dir(&dir);
        }
        dir
    }

    fn get_test_video_file() -> Option<PathBuf> {
        // Use the same logic as video_converter_tests
         let paths = vec![
             PathBuf::from("D:\\temp\\test_video\\4.mp4"),
             // Add a reliable relative path if possible, or create a dummy video via ffmpeg if needed
        ];
        for path in paths {
            if path.exists() {
                return Some(fs::canonicalize(path).unwrap());
            }
        }
        None
    }

    fn create_dummy_logo(dir: &PathBuf) -> PathBuf {
        let path = dir.join("logo.png");
        let mut img = RgbaImage::new(100, 50);
        for x in 0..100 {
            for y in 0..50 {
                img.put_pixel(x, y, Rgba([255, 0, 0, 128])); // Semi-transparent red
            }
        }
        img.save(&path).unwrap();
        path
    }

    fn get_system_font() -> String {
        // Windows typical font
        let path = PathBuf::from("C:\\Windows\\Fonts\\arial.ttf");
        if path.exists() {
            return path.to_string_lossy().to_string();
        }
        // Fallback or skip if not found? 
        // Try generic linux path just in case
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf".to_string()
    }

    #[test]
    fn test_video_watermark_text() {
        let input_opt = get_test_video_file();
        if input_opt.is_none() {
            println!("SKIPPING: No input video found.");
            return;
        }
        let input_path = input_opt.unwrap();
        let output_dir = get_test_output_dir();
        let output_path = output_dir.join("video_text_wm.mp4");

        let font_path = get_system_font();
        if !std::path::Path::new(&font_path).exists() {
             println!("SKIPPING: Font not found at {}", font_path);
             return;
        }

        let watermark = WatermarkConfig {
            text: Some(TextWatermark {
                content: "Watermark Test".to_string(),
                font_path: font_path,
                font_size: 64.0,
                color: "white".to_string(),
                opacity: 0.9,
                x: "20".to_string(),
                y: "20".to_string(),
            }),
            image: None,
        };

        let params = VideoConversionParams {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            format: Some("mp4".to_string()),
            video_encoder: Some("libx264".to_string()),
            watermark: Some(watermark),
            
            // Defaults
            video_bitrate: Some(1000),
            min_bitrate: None, max_bitrate: None, rc_mode: None,
            resolution: Some("640x360".to_string()), frame_rate: None,
            aspect_ratio: None, scaling_mode: None, gop_size: None, preset: Some("ultrafast".to_string()),
            profile: None, tune: None, color_space: None, bit_depth: None, crop: None,
            audio_tracks: None, default_audio_params: None, audio_encoder: None,
            use_hardware_acceleration: false, use_ultra_fast_speed: true,
        };

        let emitter = MockEmitter::new();
        let result = convert_video(emitter, params);
        
        match result {
            Ok(_) => {
                assert!(output_path.exists());
                let meta = fs::metadata(&output_path).unwrap();
                assert!(meta.len() > 1000);
                println!("PASS: Video Text Watermark created at {:?}", output_path);
            }
            Err(e) => panic!("Video conversion failed: {}", e),
        }
    }

    #[test]
    fn test_video_watermark_image() {
        let input_opt = get_test_video_file();
        if input_opt.is_none() { return; }
        let input_path = input_opt.unwrap();
        let output_dir = get_test_output_dir();
        let output_path = output_dir.join("video_image_wm.mp4");
        let logo_path = create_dummy_logo(&output_dir);

        let watermark = WatermarkConfig {
            text: None,
            image: Some(ImageWatermark {
                path: logo_path.to_string_lossy().to_string(),
                scale: 1.0,
                opacity: 0.5,
                x: "W-w-10".to_string(),
                y: "10".to_string(),
            }),
        };

        let params = VideoConversionParams {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            format: Some("mp4".to_string()),
            video_encoder: Some("libx264".to_string()),
            watermark: Some(watermark),
            
            // Defaults
            video_bitrate: Some(1000),
            resolution: Some("640x360".to_string()),
            preset: Some("ultrafast".to_string()),
            min_bitrate: None, max_bitrate: None, rc_mode: None, frame_rate: None,
            aspect_ratio: None, scaling_mode: None, gop_size: None,
            profile: None, tune: None, color_space: None, bit_depth: None, crop: None,
            audio_tracks: None, default_audio_params: None, audio_encoder: None,
            use_hardware_acceleration: false, use_ultra_fast_speed: true,
        };

        let emitter = MockEmitter::new();
        let result = convert_video(emitter, params);
        
        match result {
            Ok(_) => {
                assert!(output_path.exists());
                println!("PASS: Video Image Watermark created at {:?}", output_path);
            }
            Err(e) => panic!("Video conversion failed: {}", e),
        }
    }
}
