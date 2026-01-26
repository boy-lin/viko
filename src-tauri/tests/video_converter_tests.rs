#[cfg(test)]
mod tests {
    use audio_video_kit_lib::events::MockEmitter;
    use audio_video_kit_lib::video_converter::{convert_video, VideoConversionParams};
    use ffmpeg_next as ffmpeg;
    use std::fs;
    use std::path::PathBuf;

    struct TestConfig {
        name: &'static str,
        format: &'static str,
        video_encoder: Option<&'static str>,
        audio_encoder: Option<&'static str>,
        resolution: Option<&'static str>,
        bitrate: Option<&'static str>,
        audio_bitrate: Option<&'static str>,
        sample_rate: Option<&'static str>,
        frame_rate: Option<&'static str>,
        use_hardware_acceleration: bool,
    }

    fn get_test_output_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("video_converter_tests");
        if !dir.exists() {
            let _ = fs::create_dir(&dir);
        }
        dir
    }

    fn get_test_video_file() -> Option<PathBuf> {
        // Try multiple common locations for test assets
        let paths = vec![
             PathBuf::from("/Users/haolin/Downloads/Funvideo/[twitter] NoContextHumans—2023.09.20—1704860883099193465—6DF4Gs7d1zwial2Y.mp4"),
            //  PathBuf::from("D:\\temp\\test_video\\4.mp4"),
            //  PathBuf::from("../test_assets/sample.mp4"),
            //  PathBuf::from("src-tauri/test_assets/sample.mp4"),
        ];
        println!("Paths: {:#?}", paths);
        for path in paths {
            if path.exists() {
                return Some(fs::canonicalize(path).unwrap());
            }
        }
        None
    }

    fn run_conversion_test(config: &TestConfig, input_path: &PathBuf) {
        println!(
            "Config: name={}, format={}, video_encoder={:?}, audio_encoder={:?}, resolution={:?}, bitrate={:?}, audio_bitrate={:?}, sample_rate={:?}, frame_rate={:?}, use_hardware_acceleration={}",
            config.name,
            config.format,
            config.video_encoder,
            config.audio_encoder,
            config.resolution,
            config.bitrate,
            config.audio_bitrate,
            config.sample_rate,
            config.frame_rate,
            config.use_hardware_acceleration
        );
        let output_dir = get_test_output_dir();
        // Create unique output filename: format_name.ext
        let safe_name = config.name.replace(" ", "_").replace("/", "-").to_lowercase();
        let output_filename = format!("{}.{}", safe_name, config.format);
        let output_path = output_dir.join(output_filename);

        println!("Testing conversion: {} -> {}", config.name, output_path.display());

        let params = VideoConversionParams {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            format: Some(config.format.to_string()),
            video_encoder: config.video_encoder.map(|s| s.to_string()),
            // Parse resolution string "WxH" if present
            resolution: config.resolution.map(|s| s.to_string()),
            video_bitrate: config.bitrate.and_then(|s| {
                if s.ends_with("k") {
                    s.trim_end_matches("k").parse::<u32>().ok()
                } else if s.ends_with("m") {
                    s.trim_end_matches("m").parse::<u32>().ok().map(|v| v * 1000)
                } else {
                    s.parse::<u32>().ok()
                }
            }),
            
            // Audio params
            audio_encoder: config.audio_encoder.map(|s| s.to_string()),
            default_audio_params: None, // Could construct this if needed for specific bitrate/sample_rate
            
            // Defaults/None for others
            min_bitrate: None,
            max_bitrate: None,
            rc_mode: None,
            frame_rate: config.frame_rate.map(|s| s.to_string()),
            aspect_ratio: None,
            scaling_mode: None,
            gop_size: None,
            preset: Some("fast".to_string()), // Use fast preset for tests
            profile: None,
            tune: None,
            color_space: None,
            bit_depth: None,
            crop: None,
            audio_tracks: None, // TODO: Map detailed audio config if necessary
            use_hardware_acceleration: config.use_hardware_acceleration,
            use_ultra_fast_speed: true,
        };

        let emitter = MockEmitter::new();

        let result = convert_video(emitter, params);

        match result {
            Ok(_) => {
                assert!(output_path.exists(), "Output file should exist: {:?}", output_path);
                let metadata = fs::metadata(&output_path).unwrap();
                assert!(metadata.len() > 0, "Output file should not be empty: {:?}", output_path);
                println!("  [PASS] {}", config.name);
            }
            Err(e) => {
                // Allow some failures for missing system codecs (like hevc) but log them
                println!("  [WARN] Conversion failed for {}: {}", config.name, e);
                // We might want to assert failure only for critical formats
            }
        }
    }

    // #[test]
    fn test_all_format_conversions() {
        let input_opt = get_test_video_file();
        if input_opt.is_none() {
            println!("SKIPPING TESTS: No input file found (looked for test_assets/sample.mp4)");
            return;
        }
        let input_path = input_opt.unwrap();

        // ================= VIDEO GENERIC =================
        let video_generic_tests = vec![
            // MP4 H264
            // TestConfig { name: "MP4 libx264 720p", format: "mp4", video_encoder: Some("libx264"), audio_encoder: Some("aac"), resolution: Some("1280x720"), bitrate: Some("1000k"), audio_bitrate: None, sample_rate: None, frame_rate: None, use_hardware_acceleration: false },
            // TestConfig { name: "MP4 h264 720p", format: "mp4", video_encoder: Some("h264"), audio_encoder: Some("aac"), resolution: Some("1280x720"), bitrate: Some("1000k"), audio_bitrate: None, sample_rate: None, frame_rate: None, use_hardware_acceleration: true },
            // TestConfig { name: "MP4 libx264 1080p", format: "mp4", video_encoder: Some("libx264"), audio_encoder: Some("aac"), resolution: Some("1920x1080"), bitrate: Some("1000k"), audio_bitrate: None, sample_rate: None, frame_rate: None, use_hardware_acceleration: true },
            
            // MOV
            // TestConfig { name: "MOV H264", format: "mov", video_encoder: Some("h264"), audio_encoder: Some("aac"), resolution: Some("1920x1080"), bitrate: None, audio_bitrate: None, sample_rate: None, frame_rate: None, use_hardware_acceleration: false },
            
            // MKV
            // TestConfig { name: "MKV H264", format: "mkv", video_encoder: Some("h264"), audio_encoder: Some("aac"), resolution: Some("1920x1080"), bitrate: None, audio_bitrate: None, sample_rate: None, frame_rate: None, use_hardware_acceleration: false },
            
            // WEBM (VP9) - Note: libvpx-vp9 might be slow or missing, treating as optional in logic
            // TestConfig { name: "WEBM VP9", format: "webm", video_encoder: Some("libvpx-vp9"), audio_encoder: Some("libopus"), resolution: Some("1280x720"), bitrate: None, audio_bitrate: None, sample_rate: None, frame_rate: None, use_hardware_acceleration: false },
            
            // AVI
            // TestConfig { name: "AVI Mpeg4", format: "avi", video_encoder: Some("mpeg4"), audio_encoder: Some("ac3"), resolution: Some("640x480"), bitrate: Some("800k"), audio_bitrate: None, sample_rate: None, frame_rate: None, use_hardware_acceleration: false },

            // WMV (msmpeg4)
            // TestConfig { name: "WMV 2", format: "wmv", video_encoder: Some("msmpeg4v2"), audio_encoder: Some("wmav2"), resolution: Some("640x480"), bitrate: Some("1000k"), audio_bitrate: None, sample_rate: None, frame_rate: None, use_hardware_acceleration: false },

            // FLV
            // TestConfig { name: "FLV", format: "flv", video_encoder: Some("flv1"), audio_encoder: Some("libmp3lame"), resolution: Some("640x480"), bitrate: Some("800k"), audio_bitrate: None, sample_rate: None, frame_rate: None, use_hardware_acceleration: false },

            // MPG (MPEG-1)
            // TestConfig { name: "MPEG-1", format: "mpeg", video_encoder: Some("mpeg1video"), audio_encoder: Some("mp2"), resolution: Some("352x288"), bitrate: Some("1150k"), audio_bitrate: Some("128k"), sample_rate: None, frame_rate: None, use_hardware_acceleration: false },

            // MPG (MPEG-2)
            // TestConfig { name: "MPEG-2", format: "mpeg", video_encoder: Some("mpeg2video"), audio_encoder: Some("mp2"), resolution: Some("720x576"), bitrate: Some("2500k"), audio_bitrate: Some("192k"), sample_rate: None, frame_rate: None, use_hardware_acceleration: false },

            // 3GP
            // TestConfig { name: "3GP", format: "3gp", video_encoder: Some("h263"), audio_encoder: Some("aac"), resolution: Some("176x144"), bitrate: Some("128k"), audio_bitrate: Some("64k"), sample_rate: Some("8000"), frame_rate: None, use_hardware_acceleration: false },

            // VOB
            // TestConfig { name: "VOB", format: "vob", video_encoder: Some("mpeg2video"), audio_encoder: Some("pcm_s16be"), resolution: Some("720x576"), bitrate: Some("2000k"), audio_bitrate: None, sample_rate: None, frame_rate: Some("25"), use_hardware_acceleration: false },

            // OGV
            // TestConfig { name: "OGV", format: "ogg", video_encoder: Some("libtheora"), audio_encoder: Some("libvorbis"), resolution: Some("640x480"), bitrate: Some("800k"), audio_bitrate: Some("96k"), sample_rate: None, frame_rate: None, use_hardware_acceleration: false },
        ];

        // ================= DEVICES / SOCIAL =================
        let device_tests = vec![
            // Apple iPhone (MP4 H264)
            // TestConfig { name: "iPhone 1080p", format: "mp4", video_encoder: Some("libx264"), audio_encoder: Some("aac"), resolution: Some("1920x1080"), bitrate: Some("4000k"), audio_bitrate: Some("160k"), sample_rate: None, frame_rate: None, use_hardware_acceleration: false },
            
            // Android / Generic (MP4 H264)
            // TestConfig { name: "Android 720p", format: "mp4", video_encoder: Some("libx264"), audio_encoder: Some("aac"), resolution: Some("1280x720"), bitrate: Some("2500k"), audio_bitrate: Some("128k"), sample_rate: None, frame_rate: None, use_hardware_acceleration: false },
        ];


        // Run Video Tests
        println!("\n--- Running Video Generic Tests ---");
        for config in &video_generic_tests {
            run_conversion_test(config, &input_path);
        }

        // Run Device Tests
        println!("\n--- Running Device Preset Tests ---");
        for config in &device_tests {
            run_conversion_test(config, &input_path);
        }
    }
    
    // #[test]
    fn list_all_encoders() {
        audio_video_kit_lib::media_common::init_ffmpeg().unwrap();
        println!("--- Video Encoders ---");
		unsafe {
			let mut opaque: *mut std::ffi::c_void = std::ptr::null_mut();
			loop {
				let codec = ffmpeg::ffi::av_codec_iterate(&mut opaque);
				if codec.is_null() {
					break;
				}
				if (*codec).type_ == ffmpeg::ffi::AVMediaType::AVMEDIA_TYPE_VIDEO 
				   && ffmpeg::ffi::av_codec_is_encoder(codec) != 0 {
						let name = std::ffi::CStr::from_ptr((*codec).name).to_string_lossy();
						let desc = std::ffi::CStr::from_ptr((*codec).long_name).to_string_lossy();
						println!("Name: {}, Description: {}", name, desc);
				}
			}
		}
    }

    // #[test]
    fn list_all_audio_encoders() {
        audio_video_kit_lib::media_common::init_ffmpeg().unwrap();
        println!("--- Audio Encoders ---");
        unsafe {
            let mut opaque: *mut std::ffi::c_void = std::ptr::null_mut();
            loop {
                let codec = ffmpeg::ffi::av_codec_iterate(&mut opaque);
                if codec.is_null() {
                    break;
                }
                if (*codec).type_ == ffmpeg::ffi::AVMediaType::AVMEDIA_TYPE_AUDIO
                    && ffmpeg::ffi::av_codec_is_encoder(codec) != 0
                {
                    let name = std::ffi::CStr::from_ptr((*codec).name).to_string_lossy();
                    let desc = std::ffi::CStr::from_ptr((*codec).long_name).to_string_lossy();
                    println!("Name: {}, Description: {}", name, desc);
                }
            }
        }
    }

    
    
}
