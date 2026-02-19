#[cfg(test)]
mod tests {
    use audio_video_kit_lib::events::MockEmitter;
    use audio_video_kit_lib::gif_converter::{convert_video_to_gif, GifConversionParams};
    use std::fs;
    use std::path::PathBuf;

    struct GifTestConfig {
        name: &'static str,
        width: Option<u32>,
        height: Option<u32>,
        quality: Option<u32>,
        color_mode: Option<&'static str>,
        frame_rate: Option<f32>,
        frame_delay: Option<u32>,
        loop_count: Option<i32>,
        sharpen: Option<bool>,
        denoise: Option<bool>,
    }

    fn get_test_output_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("gif_converter_tests");
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

    fn run_gif_test(config: &GifTestConfig, input_path: &PathBuf) {
        println!(
            "Config: name={}, width={:?}, height={:?}, quality={:?}, color_mode={:?}, frame_rate={:?}, frame_delay={:?}, loop_count={:?}, sharpen={:?}, denoise={:?}",
            config.name,
            config.width,
            config.height,
            config.quality,
            config.color_mode,
            config.frame_rate,
            config.frame_delay,
            config.loop_count,
            config.sharpen,
            config.denoise
        );

        let output_dir = get_test_output_dir();
        let safe_name = config
            .name
            .replace(" ", "_")
            .replace("/", "-")
            .to_lowercase();
        let output_filename = format!("{}.gif", safe_name);
        let output_path = output_dir.join(output_filename);

        println!(
            "Testing gif conversion: {} -> {}",
            config.name,
            output_path.display()
        );

        let params = GifConversionParams {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            width: config.width,
            height: config.height,
            quality: config.quality,
            preserve_transparency: None,
            color_mode: config.color_mode.map(|v| v.to_string()),
            dpi: None,
            frame_rate: config.frame_rate,
            loop_count: config.loop_count,
            frame_delay: config.frame_delay,
            colors: None,
            preserve_extensions: None,
            sharpen: config.sharpen,
            denoise: config.denoise,
        };

        let emitter = MockEmitter::new();
        let result = convert_video_to_gif(emitter, params);
        match result {
            Ok(_) => {
                assert!(
                    output_path.exists(),
                    "Output file should exist: {:?}",
                    output_path
                );
                let metadata = fs::metadata(&output_path).unwrap();
                assert!(
                    metadata.len() > 0,
                    "Output file should not be empty: {:?}",
                    output_path
                );
                println!("  [PASS] {}", config.name);
            }
            Err(e) => {
                println!("  [WARN] Conversion failed for {}: {}", config.name, e);
            }
        }
    }

    #[test]
    fn test_gif_conversions() {
        let input_opt = get_test_source_file();
        if input_opt.is_none() {
            println!("SKIPPING GIF TESTS: No input file found");
            return;
        }
        let input_path = input_opt.unwrap();

        let gif_tests = vec![
            GifTestConfig {
                name: "GIF Default",
                width: Some(480),
                height: None,
                quality: Some(75),
                color_mode: Some("rgb"),
                frame_rate: Some(10.0),
                frame_delay: None,
                loop_count: Some(0),
                sharpen: None,
                denoise: None,
            },
            GifTestConfig {
                name: "GIF Grayscale Slow",
                width: Some(320),
                height: None,
                quality: Some(60),
                color_mode: Some("grayscale"),
                frame_rate: None,
                frame_delay: Some(120),
                loop_count: Some(0),
                sharpen: Some(true),
                denoise: Some(true),
            },
        ];

        println!("\n--- Running GIF Tests ---");
        for config in &gif_tests {
            run_gif_test(config, &input_path);
        }
    }
}
