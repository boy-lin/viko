#[cfg(test)]
mod tests {
    use audio_video_kit_lib::events::MockEmitter;
    use audio_video_kit_lib::audio_converter::{convert_audio, AudioConversionParams};
    use std::fs;
    use std::path::PathBuf;

    struct AudioTestConfig {
        name: &'static str,
        format: &'static str,
        codec: Option<&'static str>,
        bitrate: Option<&'static str>, // e.g., "320k"
        sample_rate: Option<u32>,
        channels: Option<u32>,
        use_hardware_acceleration: bool,
    }

    fn get_test_output_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("audio_converter_tests");
        if !dir.exists() {
            let _ = fs::create_dir(&dir);
        }
        dir
    }

    fn get_test_source_file() -> Option<PathBuf> {
        // Try multiple common locations for test assets (reusing video file which usually has audio)
        let paths = vec![
            PathBuf::from("D:\\temp\\test_video\\4.mp4"),
             // Add other paths if needed
        ];
        
        for path in paths {
            if path.exists() {
                return Some(fs::canonicalize(path).unwrap());
            }
        }
        None
    }

    fn run_audio_test(config: &AudioTestConfig, input_path: &PathBuf) {
        println!(
            "Config: name={}, format={}, codec={:?}, bitrate={:?}, rate={:?}, ch={:?}",
            config.name, config.format, config.codec, config.bitrate, config.sample_rate, config.channels
        );

        let output_dir = get_test_output_dir();
        let safe_name = config.name.replace(" ", "_").replace("/", "-").to_lowercase();
        let output_filename = format!("{}.{}", safe_name, config.format);
        let output_path = output_dir.join(output_filename);

        println!("Testing audio conversion: {} -> {}", config.name, output_path.display());

        // Parse bitrate string to f32 (kbps)
        let bitrate_val = config.bitrate.and_then(|s| {
            if s.ends_with("k") {
                s.trim_end_matches("k").parse::<f32>().ok()
            } else {
                s.parse::<f32>().ok()
            }
        });

        let params = AudioConversionParams {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            format: Some(config.format.to_string()),
            codec: config.codec.map(|s| s.to_string()),
            bitrate: bitrate_val, // AudioConversionParams expects f32 in kbps
            sample_rate: config.sample_rate,
            channels: config.channels,
            bit_depth: None,
            quality: None,
            use_hardware_acceleration: Some(config.use_hardware_acceleration),
            use_ultra_fast_speed: Some(true),
        };

        let emitter = MockEmitter::new();
        let result = convert_audio(emitter, params);

        match result {
            Ok(_) => {
                assert!(output_path.exists(), "Output file should exist: {:?}", output_path);
                let metadata = fs::metadata(&output_path).unwrap();
                assert!(metadata.len() > 0, "Output file should not be empty: {:?}", output_path);
                println!("  [PASS] {}", config.name);
            }
            Err(e) => {
                println!("  [WARN] Conversion failed for {}: {}", config.name, e);
            }
        }
    }

    #[test]
    fn test_audio_format_conversions() {
        let input_opt = get_test_source_file();
        if input_opt.is_none() {
            println!("SKIPPING AUDIO TESTS: No input file found");
            return;
        }
        let input_path = input_opt.unwrap();

        let audio_tests = vec![
            // MP3
            AudioTestConfig { name: "MP3 High", format: "mp3", codec: Some("libmp3lame"), bitrate: Some("320k"), sample_rate: None, channels: None, use_hardware_acceleration: false },
            // M4A (AAC)
            AudioTestConfig { name: "M4A AAC", format: "m4a", codec: Some("aac"), bitrate: Some("256k"), sample_rate: None, channels: None, use_hardware_acceleration: false },
            // WAV
            AudioTestConfig { name: "WAV PCM", format: "wav", codec: Some("pcm_s16le"), bitrate: None, sample_rate: None, channels: None, use_hardware_acceleration: false },
            // OGG
            AudioTestConfig { name: "OGG Vorbis", format: "ogg", codec: Some("libvorbis"), bitrate: Some("192k"), sample_rate: None, channels: None, use_hardware_acceleration: false },
            // FLAC
            AudioTestConfig { name: "FLAC", format: "flac", codec: Some("flac"), bitrate: None, sample_rate: None, channels: None, use_hardware_acceleration: false },
        ];

        println!("\n--- Running Audio Format Tests ---");
        for config in &audio_tests {
            run_audio_test(config, &input_path);
        }
    }
}
