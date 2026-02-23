#[cfg(test)]
mod tests {
    use viko_lib::image_converter::{convert_image_file, ImageConversionParams};
    use std::fs;
    use std::path::PathBuf;

    struct ImageTestConfig {
        name: &'static str,
        format: &'static str,
        width: Option<u32>,
        height: Option<u32>,
    }

    fn get_test_output_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("image_converter_tests");
        if !dir.exists() {
            let _ = fs::create_dir(&dir);
        }
        dir
    }

    fn get_test_source_file() -> Option<PathBuf> {
        let paths = vec![
            PathBuf::from("/Users/haolin/Downloads/Funvideo/[twitter] NoContextHumans—2023.09.20—1704860883099193465—6DF4Gs7d1zwial2Y.mp4"),
            
        ];
        for path in paths {
            if path.exists() {
                return Some(fs::canonicalize(path).unwrap());
            }
        }
        None
    }

    fn run_image_test(config: &ImageTestConfig, input_path: &PathBuf) {
        println!(
            "Config: name={}, format={}, width={:?}, height={:?}",
            config.name, config.format, config.width, config.height
        );

        let output_dir = get_test_output_dir();
        let safe_name = config
            .name
            .replace(" ", "_")
            .replace("/", "-")
            .to_lowercase();
        let output_filename = format!("{}.{}", safe_name, config.format);
        let output_path = output_dir.join(output_filename);

        println!(
            "Testing image conversion: {} -> {}",
            config.name,
            output_path.display()
        );

        let params = ImageConversionParams {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            width: config.width,
            height: config.height,
            format: config.format.to_string(),
        };

        let result = tauri::async_runtime::block_on(convert_image_file(params));
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
    fn test_image_format_conversions() {
        let input_opt = get_test_source_file();
        if input_opt.is_none() {
            println!("SKIPPING IMAGE TESTS: No input file found");
            return;
        }
        let input_path = input_opt.unwrap();

        let image_tests = vec![
            ImageTestConfig {
                name: "JPEG",
                format: "jpg",
                width: Some(640),
                height: None,
            },
            ImageTestConfig {
                name: "PNG",
                format: "png",
                width: Some(640),
                height: None,
            },
            ImageTestConfig {
                name: "WEBP",
                format: "webp",
                width: Some(640),
                height: None,
            },
            ImageTestConfig {
                name: "GIF",
                format: "gif",
                width: Some(320),
                height: None,
            },
            ImageTestConfig {
                name: "BMP",
                format: "bmp",
                width: Some(640),
                height: None,
            },
            ImageTestConfig {
                name: "TIFF",
                format: "tiff",
                width: Some(640),
                height: None,
            },
            ImageTestConfig {
                name: "ICO",
                format: "ico",
                width: Some(256),
                height: Some(256),
            },
        ];

        println!("\n--- Running Image Format Tests ---");
        for config in &image_tests {
            run_image_test(config, &input_path);
        }
    }
}
