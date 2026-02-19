#[cfg(test)]
mod tests {
    use audio_video_kit_lib::commands::AudioConversionArgs;
    use audio_video_kit_lib::storage::{db, media_queue};
    use audio_video_kit_lib::task::queue::MediaTaskRequest;
    use std::env;
    use std::fs;
    use std::path::PathBuf;

    async fn setup_test_db() -> PathBuf {
        let mut path = std::env::temp_dir();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("test_db_{}.sqlite", timestamp));

        let url = format!("sqlite://{}", path.to_string_lossy());
        env::set_var("DATABASE_URL", &url);

        // Ensure creation
        let _ = fs::File::create(&path);

        db::init_db().await.expect("Failed to init DB");
        db::init_meta().await.expect("Failed to init meta");

        // Manually create media_queue table as it might not be auto-created by init_db
        // (depending on how it's wired, usually tables verify themselves on access or migration)
        // Check implementation of MediaQueueTable::check_latest() or similar?
        // In storage/media_queue.rs we implemented TableSpec.
        // We need to call check_latest for it.
        // Wait, db.rs defines `TableSpec`. We usually call `YourTable::check_latest().await`.
        // But `media_queue` module didn't expose a `init` function calling `check_latest`.
        // Let's call it via generic mechanism if possible, or just exact SQL.
        // Actually `MediaQueueTable` implements `TableSpec`.
        use audio_video_kit_lib::storage::db::TableSpec;
        audio_video_kit_lib::storage::media_queue::MediaQueueTable::check_latest()
            .await
            .expect("Failed to init table");

        path
    }

    async fn teardown_test_db(path: PathBuf) {
        let _ = db::close_db().await;
        // Introduce small delay to ensure file handles are released
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let _ = fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_enqueue_dequeue() {
        let db_path = setup_test_db().await;

        let task = MediaTaskRequest::ConvertAudio(AudioConversionArgs {
            task_id: "task-1".into(),
            input_path: "input.mp3".into(),
            output_path: None,
            format: Some("mp3".into()),
            codec: None,
            bitrate: None,
            sample_rate: None,
            channels: None,
            bit_depth: None,
            quality: None,
            use_hardware_acceleration: Some(false),
            use_ultra_fast_speed: Some(false),
        });

        media_queue::enqueue(&task).await.expect("Enqueue failed");

        let count = media_queue::count().await.expect("Count failed");
        assert_eq!(count, 1);

        let fetched = media_queue::dequeue().await.expect("Dequeue failed");
        assert!(fetched.is_some());

        if let Some(MediaTaskRequest::ConvertAudio(args)) = fetched {
            assert_eq!(args.task_id, "task-1");
        } else {
            panic!("Wrong task type");
        }

        let count_after = media_queue::count().await.expect("Count failed");
        assert_eq!(count_after, 0);

        teardown_test_db(db_path).await;
    }

    #[tokio::test]
    async fn test_clear() {
        let db_path = setup_test_db().await;

        for i in 0..3 {
            let task = MediaTaskRequest::ConvertAudio(AudioConversionArgs {
                task_id: format!("task-{}", i),
                input_path: "input.mp3".into(),
                output_path: None,
                format: None,
                codec: None,
                bitrate: None,
                sample_rate: None,
                channels: None,
                bit_depth: None,
                quality: None,
                use_hardware_acceleration: None,
                use_ultra_fast_speed: None,
            });
            media_queue::enqueue(&task).await.expect("Enqueue failed");
        }

        let count = media_queue::count().await.expect("Count failed");
        assert_eq!(count, 3);

        media_queue::clear().await.expect("Clear failed");

        let count_after = media_queue::count().await.expect("Count failed");
        assert_eq!(count_after, 0);

        teardown_test_db(db_path).await;
    }
}
