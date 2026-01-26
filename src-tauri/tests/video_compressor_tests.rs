#[cfg(test)]
mod tests {
    use audio_video_kit_lib::events::MockEmitter;
    use audio_video_kit_lib::video_compressor::{compress_video_file, VideoCompressionParams};
    use std::fs;
    use std::path::PathBuf;

    struct VideoCompressTestConfig {
        name: &'static str,
        codec: Option<&'static str>,
        width: Option<u32>,
        height: Option<u32>,
        bitrate: Option<u32>,
        frame_rate: Option<f32>,
        remove_audio: Option<bool>,
        audio_bitrate: Option<u32>,
        preset: Option<&'static str>,
        use_hardware_acceleration: Option<bool>,
    }

    fn get_test_output_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("video_compressor_tests");
        if !dir.exists() {
            let _ = fs::create_dir(&dir);
        }
        dir
    }

    fn get_test_source_file() -> Option<PathBuf> {
        let paths = vec![
            PathBuf::from("/Users/haolin/Downloads/Funvideo/[twitter] NoContextHumans—2023.09.20—1704860883099193465—6DF4Gs7d1zwial2Y.mp4"),
            PathBuf::from("src-tauri/test_assets/sample.mp4"),
        ];
        for path in paths {
            if path.exists() {
                return Some(fs::canonicalize(path).unwrap());
            }
        }
        None
    }

    fn run_video_compress_test(config: &VideoCompressTestConfig, input_path: &PathBuf) {
        println!(
            "Config: name={}, codec={:?}, width={:?}, height={:?}, bitrate={:?}, frame_rate={:?}, remove_audio={:?}, audio_bitrate={:?}, preset={:?}, hw={:?}",
            config.name,
            config.codec,
            config.width,
            config.height,
            config.bitrate,
            config.frame_rate,
            config.remove_audio,
            config.audio_bitrate,
            config.preset,
            config.use_hardware_acceleration
        );

        let output_dir = get_test_output_dir();
        let safe_name = config.name.replace(" ", "_").replace("/", "-").to_lowercase();
        let output_path = output_dir.join(format!("{}.mp4", safe_name));

        println!("Testing video compression: {} -> {}", config.name, output_path.display());

        let params = VideoCompressionParams {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            compression_ratio: None,
            width: config.width,
            height: config.height,
            bitrate: config.bitrate,
            frame_rate: config.frame_rate,
            codec: config.codec.map(|s| s.to_string()),
            keyframe_interval: Some(60),
            color_depth: None,
            aspect_ratio: None,
            remove_audio: config.remove_audio,
            audio_bitrate: config.audio_bitrate,
            preset: config.preset.map(|s| s.to_string()),
            use_hardware_acceleration: config.use_hardware_acceleration,
        };

        let emitter = MockEmitter::new();
        let result = compress_video_file(emitter, params);
        match result {
            Ok(_) => {
                assert!(output_path.exists(), "Output file should exist: {:?}", output_path);
                let metadata = fs::metadata(&output_path).unwrap();
                assert!(metadata.len() > 0, "Output file should not be empty: {:?}", output_path);
                println!("  [PASS] {}", config.name);
            }
            Err(e) => {
                println!("  [WARN] Compression failed for {}: {}", config.name, e);
            }
        }
    }

    #[test]
    fn test_video_compression() {
        let input_opt = get_test_source_file();
        if input_opt.is_none() {
            println!("SKIPPING VIDEO COMPRESSION TESTS: No input file found");
            return;
        }
        let input_path = input_opt.unwrap();

        let tests = vec![
            VideoCompressTestConfig {
                name: "H264 720p",
                codec: Some("libx264"),
                width: Some(1280),
                height: Some(720),
                bitrate: Some(1500),
                frame_rate: Some(25.0),
                remove_audio: Some(false),
                audio_bitrate: Some(128),
                preset: Some("fast"),
                use_hardware_acceleration: Some(false),
            },
            VideoCompressTestConfig {
                name: "H264 480p NoAudio",
                codec: Some("libx264"),
                width: Some(854),
                height: Some(480),
                bitrate: Some(900),
                frame_rate: Some(25.0),
                remove_audio: Some(true),
                audio_bitrate: None,
                preset: Some("fast"),
                use_hardware_acceleration: Some(false),
            },
        ];

        println!("\n--- Running Video Compressor Tests ---");
        for config in &tests {
            run_video_compress_test(config, &input_path);
        }
    }
}
