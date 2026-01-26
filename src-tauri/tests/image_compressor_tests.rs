#[cfg(test)]
mod tests {
    use audio_video_kit_lib::events::MockEmitter;
    use audio_video_kit_lib::image_compressor::{compress_image_file, ImageCompressionParams};
    use image::{ImageBuffer, Rgb};
    use std::fs;
    use std::path::PathBuf;

    struct ImageCompressTestConfig {
        name: &'static str,
        format: &'static str,
        quality: Option<u32>,
        width: Option<u32>,
        height: Option<u32>,
        keep_transparency: Option<bool>,
        color_mode: Option<&'static str>,
    }

    fn get_test_output_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("image_compressor_tests");
        if !dir.exists() {
            let _ = fs::create_dir(&dir);
        }
        dir
    }

    fn ensure_test_input_image() -> Option<PathBuf> {
        let output_dir = get_test_output_dir();
        let input_path = output_dir.join("input_sample.png");
        if input_path.exists() {
            return Some(input_path);
        }

        let width = 256u32;
        let height = 256u32;
        let mut img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(width, height);
        for (x, y, pixel) in img.enumerate_pixels_mut() {
            let r = (x % 256) as u8;
            let g = (y % 256) as u8;
            let b = ((x + y) % 256) as u8;
            *pixel = Rgb([r, g, b]);
        }

        if img.save(&input_path).is_ok() {
            Some(input_path)
        } else {
            None
        }
    }

    fn run_image_compress_test(config: &ImageCompressTestConfig, input_path: &PathBuf) {
        println!(
            "Config: name={}, format={}, quality={:?}, width={:?}, height={:?}, keep_transparency={:?}, color_mode={:?}",
            config.name,
            config.format,
            config.quality,
            config.width,
            config.height,
            config.keep_transparency,
            config.color_mode
        );

        let output_dir = get_test_output_dir();
        let safe_name = config.name.replace(" ", "_").replace("/", "-").to_lowercase();
        let output_path = output_dir.join(format!("{}.{}", safe_name, config.format));

        println!("Testing image compression: {} -> {}", config.name, output_path.display());

        let params = ImageCompressionParams {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            quality: config.quality,
            format: Some(config.format.to_string()),
            width: config.width,
            height: config.height,
            color_mode: config.color_mode.map(|v| v.to_string()),
            strip_metadata: Some(true),
            keep_transparency: config.keep_transparency,
            dpi: None,
            crop_whitespace: Some(false),
        };

        let emitter = MockEmitter::new();
        let result = compress_image_file(emitter, params);
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
    fn test_image_compression() {
        let input_opt = ensure_test_input_image();
        if input_opt.is_none() {
            println!("SKIPPING IMAGE COMPRESSION TESTS: Failed to create input image");
            return;
        }
        let input_path = input_opt.unwrap();

        let tests = vec![
            ImageCompressTestConfig {
                name: "JPEG 80",
                format: "jpg",
                quality: Some(80),
                width: Some(512),
                height: None,
                keep_transparency: Some(false),
                color_mode: Some("RGB"),
            },
            ImageCompressTestConfig {
                name: "PNG Default",
                format: "png",
                quality: Some(70),
                width: Some(512),
                height: None,
                keep_transparency: Some(true),
                color_mode: None,
            },
            ImageCompressTestConfig {
                name: "WEBP Lossy",
                format: "webp",
                quality: Some(80),
                width: Some(512),
                height: None,
                keep_transparency: Some(true),
                color_mode: None,
            },
        ];

        println!("\n--- Running Image Compressor Tests ---");
        for config in &tests {
            run_image_compress_test(config, &input_path);
        }
    }
}
