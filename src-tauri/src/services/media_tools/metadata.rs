use crate::services::ffmpeg::media_info::get_media_details;
use crate::services::ffmpeg::media_info::MediaDetails;
use ffmpeg_next as ffmpeg;
use std::collections::HashMap;
use std::path::Path;

/// Metadata information for frontend
pub type Metadata = MediaDetails;

/// Read metadata from a file (reusing existing detailed info logic)
pub fn read_metadata(path: &str) -> Result<Metadata, String> {
    crate::media_common::init_ffmpeg()?;
    get_media_details(path)
}

/// Write metadata to a media file.
/// This function remuxes streams with ffmpeg-next and updates container metadata without re-encoding.
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
    crate::media_common::init_ffmpeg()?;

    if !Path::new(input_path).exists() {
        return Err(format!("Input file not found: {}", input_path));
    }
    if input_path == output_path {
        return Err("Input and output path must be different".to_string());
    }

    if Path::new(output_path).exists() {
        std::fs::remove_file(output_path)
            .map_err(|e| format!("Failed to overwrite output file: {e}"))?;
    }

    let mut ictx =
        ffmpeg::format::input(input_path).map_err(|e| format!("Failed to open input file: {e}"))?;
    let mut octx = ffmpeg::format::output(output_path)
        .map_err(|e| format!("Failed to open output file: {e}"))?;

    let stream_count = ictx.nb_streams() as usize;
    let mut stream_mapping = vec![-1isize; stream_count];
    let mut ist_time_bases = vec![ffmpeg::Rational(0, 1); stream_count];
    let mut ost_index = 0usize;

    for (ist_index, ist) in ictx.streams().enumerate() {
        stream_mapping[ist_index] = ost_index as isize;
        ist_time_bases[ist_index] = ist.time_base();

        let mut ost = octx
            .add_stream(ffmpeg::encoder::find(ffmpeg::codec::Id::None))
            .map_err(|e| format!("Failed to add output stream: {e}"))?;
        ost.set_parameters(ist.parameters());
        unsafe {
            (*ost.parameters().as_mut_ptr()).codec_tag = 0;
        }

        ost_index += 1;
    }

    let mut out_meta = ictx.metadata().to_owned();
    for (key, value) in metadata {
        out_meta.set(&key, &value);
    }
    octx.set_metadata(out_meta);

    octx.write_header()
        .map_err(|e| format!("Failed to write output header: {e}"))?;

    let mut ost_time_bases = vec![ffmpeg::Rational(0, 1); ost_index];
    for (index, item) in ost_time_bases.iter_mut().enumerate() {
        *item = octx
            .stream(index)
            .ok_or_else(|| format!("Missing output stream at index {index}"))?
            .time_base();
    }

    for (stream, mut packet) in ictx.packets() {
        let ist_index = stream.index();
        let mapped = stream_mapping[ist_index];
        if mapped < 0 {
            continue;
        }

        let ost_index = mapped as usize;
        packet.rescale_ts(ist_time_bases[ist_index], ost_time_bases[ost_index]);
        packet.set_position(-1);
        packet.set_stream(ost_index);
        packet
            .write_interleaved(&mut octx)
            .map_err(|e| format!("Failed to write packet: {e}"))?;
    }

    octx.write_trailer()
        .map_err(|e| format!("Failed to write output trailer: {e}"))?;

    Ok(())
}
