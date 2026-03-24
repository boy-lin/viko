#[cfg(test)]
mod tests {
    use image::{Rgb, RgbImage, Rgba, RgbaImage};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use viko_lib::events::MockEmitter;
    use viko_lib::services::convert::video::{convert_video, VideoConversionParams};
    use viko_lib::services::media_tools::watermark::{ImageWatermark, WatermarkConfig};

    fn get_test_output_dir() -> PathBuf {
        let dir = std::env::temp_dir().join("viko_watermark_tests");
        let _ = fs::create_dir_all(&dir);
        dir
    }

    fn get_test_video_file() -> Option<PathBuf> {
        let candidates = [
            PathBuf::from("D:\\temp\\test_video\\1.avi"),
            PathBuf::from("D:\\temp\\test_video\\4.mp4"),
        ];

        candidates
            .into_iter()
            .find(|path| path.exists())
            .and_then(|path| fs::canonicalize(path).ok())
    }

    fn create_test_png(path: &Path) {
        let mut img = RgbaImage::new(128, 72);
        for x in 0..img.width() {
            for y in 0..img.height() {
                img.put_pixel(x, y, Rgba([255, 0, 0, 160]));
            }
        }
        img.save(path).unwrap();
    }

    fn create_test_jpg(path: &Path) {
        let mut img = RgbImage::new(128, 72);
        for x in 0..img.width() {
            for y in 0..img.height() {
                img.put_pixel(x, y, Rgb([255, 180, 0]));
            }
        }
        img.save(path).unwrap();
    }

    fn build_video_watermark_params(
        input_path: &Path,
        output_path: &Path,
        image_path: &Path,
    ) -> VideoConversionParams {
        VideoConversionParams {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            format: Some(
                output_path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .unwrap_or("mp4")
                    .to_string(),
            ),
            video_encoder: Some("libx264".to_string()),
            video_bitrate: None,
            min_bitrate: None,
            max_bitrate: None,
            rc_mode: None,
            crf: None,
            resolution: Some("400x300".to_string()),
            frame_rate: None,
            aspect_ratio: None,
            scaling_mode: None,
            gop_size: None,
            preset: Some("ultrafast".to_string()),
            profile: None,
            tune: None,
            color_space: None,
            color_range: None,
            bit_depth: None,
            crop: None,
            audio_tracks: None,
            default_audio_params: None,
            audio_filter_spec: None,
            audio_encoder: None,
            use_hardware_acceleration: false,
            use_ultra_fast_speed: true,
            watermark: Some(WatermarkConfig {
                text: None,
                image: Some(ImageWatermark {
                    path: image_path.to_string_lossy().to_string(),
                    rotation: Some(0.0),
                    scale: 1.0,
                    opacity: 0.5,
                    x: "0".to_string(),
                    y: "0".to_string(),
                    anchor: Some("c".to_string()),
                    offset_x: Some(0.0),
                    offset_y: Some(0.0),
                    offset_unit: Some("px".to_string()),
                    size_mode: Some("video_width_ratio".to_string()),
                    size_value: Some(0.24),
                }),
            }),
            forced_watermark: None,
        }
    }

    fn resolve_external_png_fixture() -> Option<PathBuf> {
        let candidates = [
            PathBuf::from(r"C:\Users\admin\Pictures\tttt.png"),
            PathBuf::from(r"D:\temp\test_video\20230302123650_94ec1.png"),
        ];

        candidates.into_iter().find(|path| path.exists())
    }

    fn build_ffmpeg_movie_filter_path(path: &Path) -> String {
        let normalized = path.to_string_lossy().replace('\\', "/");
        if cfg!(target_os = "windows") {
            normalized.replace(':', "\\:")
        } else {
            normalized
        }
    }

    fn build_ffmpeg_movie_filter_source(path: &Path) -> String {
        let safe_path = build_ffmpeg_movie_filter_path(path);
        let is_png = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("png"))
            .unwrap_or(false);

        if cfg!(target_os = "windows") && is_png {
            format!(
                "movie=filename='{}':format_name=image2:format_opts='probesize=5000000\\:analyzeduration=10000000'",
                safe_path
            )
        } else {
            format!("movie=filename='{}'", safe_path)
        }
    }

    #[test]
    fn test_video_image_watermark_with_jpg() {
        let input_path = match get_test_video_file() {
            Some(path) => path,
            None => {
                println!("SKIPPING: no local test video found.");
                return;
            }
        };

        let dir = get_test_output_dir();
        let image_path = dir.join("watermark_test.jpg");
        let output_path = dir.join("video_watermark_jpg.avi");
        let _ = fs::remove_file(&output_path);
        create_test_jpg(&image_path);

        let emitter = MockEmitter::new();
        let result = convert_video(
            emitter,
            build_video_watermark_params(&input_path, &output_path, &image_path),
        );

        match result {
            Ok(_) => {
                assert!(output_path.exists(), "expected output video to exist");
                let meta = fs::metadata(&output_path).unwrap();
                assert!(meta.len() > 0, "expected output video not to be empty");
            }
            Err(error) => panic!("jpg watermark conversion failed: {}", error),
        }
    }

    #[test]
    fn test_video_image_watermark_with_png_regression() {
        let input_path = match get_test_video_file() {
            Some(path) => path,
            None => {
                println!("SKIPPING: no local test video found.");
                return;
            }
        };

        let dir = get_test_output_dir();
        let image_path = dir.join("watermark_test.png");
        let output_path = dir.join("video_watermark_png.avi");
        let _ = fs::remove_file(&output_path);
        create_test_png(&image_path);

        let emitter = MockEmitter::new();
        let result = convert_video(
            emitter,
            build_video_watermark_params(&input_path, &output_path, &image_path),
        );

        match result {
            Ok(_) => {
                assert!(output_path.exists(), "expected output video to exist");
                let meta = fs::metadata(&output_path).unwrap();
                assert!(meta.len() > 0, "expected output video not to be empty");
            }
            Err(error) => panic!("png watermark conversion failed: {}", error),
        }
    }

    #[test]
    #[ignore = "Manual diagnosis helper for local FFmpeg movie PNG parsing"]
    fn test_ffmpeg_movie_filter_reads_png_fixture() {
        let image_path = match resolve_external_png_fixture() {
            Some(path) => path,
            None => {
                println!("SKIPPING: no local PNG fixture found.");
                return;
            }
        };

        let filter_arg = build_ffmpeg_movie_filter_source(&image_path);

        let output = Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-loglevel",
                "debug",
                "-f",
                "lavfi",
                "-i",
                &filter_arg,
                "-frames:v",
                "1",
                "-f",
                "null",
                "-",
            ])
            .output()
            .expect("failed to spawn ffmpeg");

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("ffmpeg stdout:\n{}", stdout);
        println!("ffmpeg stderr:\n{}", stderr);

        assert!(
            output.status.success(),
            "ffmpeg movie filter failed for fixture {}.\nstdout:\n{}\nstderr:\n{}",
            image_path.display(),
            stdout,
            stderr
        );
    }

    #[test]
    #[ignore = "Manual diagnosis helper for full filtergraph PNG overlay parsing"]
    fn test_ffmpeg_full_filtergraph_reads_png_fixture() {
        let input_path = match get_test_video_file() {
            Some(path) => path,
            None => {
                println!("SKIPPING: no local test video found.");
                return;
            }
        };
        let image_path = match resolve_external_png_fixture() {
            Some(path) => path,
            None => {
                println!("SKIPPING: no local PNG fixture found.");
                return;
            }
        };

        let filter_arg = format!(
            "{}[wm_overlay_1];[wm_overlay_1]scale=96:-1,format=rgba,colorchannelmixer=aa=0.5[wm_overlay_scaled_1];[0:v][wm_overlay_scaled_1]overlay=x=(main_w-overlay_w)/2+0:y=(main_h-overlay_h)/2+0[outv]",
            build_ffmpeg_movie_filter_source(&image_path)
        );

        let output = Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-loglevel",
                "debug",
                "-i",
                input_path.to_string_lossy().as_ref(),
                "-filter_complex",
                &filter_arg,
                "-map",
                "[outv]",
                "-frames:v",
                "1",
                "-f",
                "null",
                "-",
            ])
            .output()
            .expect("failed to spawn ffmpeg");

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        println!("ffmpeg stdout:\n{}", stdout);
        println!("ffmpeg stderr:\n{}", stderr);

        assert!(
            output.status.success(),
            "ffmpeg full filtergraph failed for input {} with png {}.\nstdout:\n{}\nstderr:\n{}",
            input_path.display(),
            image_path.display(),
            stdout,
            stderr
        );
    }
}
