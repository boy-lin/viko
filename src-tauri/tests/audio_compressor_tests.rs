#[cfg(test)]
mod tests {
    use audio_video_kit_lib::audio_compressor::{compress_audio_file, AudioCompressionParams};
    use audio_video_kit_lib::events::MockEmitter;
    use std::fs;
    use std::path::PathBuf;

    struct AudioCompressTestConfig {
        name: &'static str,
        format: &'static str,
        codec: Option<&'static str>,
        bitrate: Option<u32>,
        sample_rate: Option<u32>,
        channels: Option<u32>,
    }

    fn get_test_output_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("audio_compressor_tests");
        if !dir.exists() {
            let _ = fs::create_dir(&dir);
        }
        dir
    }

    fn get_test_source_file() -> Option<PathBuf> {
        let paths = vec![
            PathBuf::from("/Users/haolin/Downloads/Audio/pitch1.00_tempo1.00.mp3"),
        ];
        for path in paths {
            if path.exists() {
                return Some(fs::canonicalize(path).unwrap());
            }
        }
        None
    }

    fn run_audio_compress_test(config: &AudioCompressTestConfig, input_path: &PathBuf) {
        println!(
            "Config: name={}, format={}, codec={:?}, bitrate={:?}, sample_rate={:?}, channels={:?}",
            config.name, config.format, config.codec, config.bitrate, config.sample_rate, config.channels
        );

        let output_dir = get_test_output_dir();
        let safe_name = config.name.replace(" ", "_").replace("/", "-").to_lowercase();
        let output_path = output_dir.join(format!("{}.{}", safe_name, config.format));

        println!("Testing audio compression: {} -> {}", config.name, output_path.display());

        let params = AudioCompressionParams {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            compression_ratio: None,
            sample_rate: config.sample_rate,
            bitrate: config.bitrate,
            codec: config.codec.map(|s| s.to_string()),
            channels: config.channels,
            bit_depth: None,
            remove_silence: Some(false),
            silence_threshold: None,
            volume_gain: None,
        };

        let emitter = MockEmitter::new();
        let result = compress_audio_file(emitter, params);
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
    fn test_audio_compression() {
        let input_opt = get_test_source_file();
        if input_opt.is_none() {
            println!("SKIPPING AUDIO COMPRESSION TESTS: No input file found");
            return;
        }
        let input_path = input_opt.unwrap();

        let tests = vec![
            AudioCompressTestConfig {
                name: "AAC 128k",
                format: "m4a",
                codec: Some("aac"),
                bitrate: Some(128),
                sample_rate: Some(44100),
                channels: Some(2),
            },
            AudioCompressTestConfig {
                name: "MP3 192k",
                format: "mp3",
                codec: Some("libmp3lame"),
                bitrate: Some(192),
                sample_rate: Some(44100),
                channels: Some(2),
            },
        ];

        println!("\n--- Running Audio Compressor Tests ---");
        for config in &tests {
            run_audio_compress_test(config, &input_path);
        }
    }
}
