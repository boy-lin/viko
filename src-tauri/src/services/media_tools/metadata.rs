use crate::services::ffmpeg::media_info::get_media_details;
use crate::services::ffmpeg::media_info::MediaDetails;
use ffmpeg_next as ffmpeg;
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

/// Metadata information for frontend
pub type Metadata = MediaDetails;

/// Read metadata from a file (reusing existing detailed info logic)
pub fn read_metadata(path: &str) -> Result<Metadata, String> {
    get_media_details(path)
}

/// Write metadata to a media file
/// This function uses ffmpeg CLI to copy streams and update metadata to avoid re-encoding.
///
/// # Arguments
/// * `input_path` - Path to the source file
/// * `output_path` - Path to save the new file
/// * `metadata` - Key-value pairs of metadata to write
pub fn write_metadata(
    input_path: &str,
    output_path: &str,
    metadata: HashMap<String, String>,
) -> Result<(), String> {
    if !Path::new(input_path).exists() {
        return Err(format!("Input file not found: {}", input_path));
    }

    // Build FFmpeg command
    // ffmpeg -i input.mp4 -map_metadata 0 -metadata title="New Title" -c copy output.mp4

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-i").arg(input_path);

    // Copy all metadata from input first (default behavior usually, but Good to be explicit if needed)
    // Actually -map_metadata 0 is default for single input.

    // Override/Add metadata
    for (key, value) in &metadata {
        // Handle empty values by setting them to empty string effectively deleting them if supported,
        // or just updating.
        cmd.arg("-metadata").arg(format!("{}={}", key, value));
    }

    // Copy all streams without re-encoding
    cmd.arg("-c").arg("copy");

    // Overwrite output
    cmd.arg("-y");

    cmd.arg(output_path);

    // Disable stdin to prevent hanging
    cmd.stdin(std::process::Stdio::null());

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg failed: {}", stderr));
    }

    Ok(())
}
