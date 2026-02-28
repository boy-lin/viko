#[cfg(test)]
mod tests {
    use ffmpeg_next as ffmpeg;
    use std::ffi::CStr;

    #[test]
    fn print_ffmpeg_buildconf_and_filters() {
        viko_lib::media_common::init_ffmpeg().expect("failed to init ffmpeg");

        unsafe {
            let version = CStr::from_ptr(ffmpeg::ffi::av_version_info()).to_string_lossy();
            let codec_conf = CStr::from_ptr(ffmpeg::ffi::avcodec_configuration()).to_string_lossy();

            println!("--- ffmpeg -version ---");
            println!("version: {}", version);
            println!();

            println!("--- ffmpeg -buildconf (from avcodec_configuration) ---");
            println!("{}", codec_conf);
            println!();

            println!("--- ffmpeg -filters (from av_filter_iterate) ---");
            let mut opaque: *mut std::ffi::c_void = std::ptr::null_mut();
            let mut has_drawtext = false;
            let mut count = 0usize;

            loop {
                let filter = ffmpeg::ffi::av_filter_iterate(&mut opaque);
                if filter.is_null() {
                    break;
                }

                let name = CStr::from_ptr((*filter).name).to_string_lossy().to_string();
                let desc = if (*filter).description.is_null() {
                    String::new()
                } else {
                    CStr::from_ptr((*filter).description)
                        .to_string_lossy()
                        .to_string()
                };

                if name == "drawtext" {
                    has_drawtext = true;
                }

                println!("{} - {}", name, desc);
                count += 1;
            }

            println!();
            println!("filter count: {}", count);
            println!("has drawtext: {}", has_drawtext);

            println!();
            println!("--- ffmpeg encoders (from av_codec_iterate) ---");
            let mut codec_opaque: *mut std::ffi::c_void = std::ptr::null_mut();
            let mut encoder_count = 0usize;

            loop {
                let codec = ffmpeg::ffi::av_codec_iterate(&mut codec_opaque);
                if codec.is_null() {
                    break;
                }

                if ffmpeg::ffi::av_codec_is_encoder(codec) == 0 {
                    continue;
                }

                let codec_name = CStr::from_ptr((*codec).name).to_string_lossy().to_string();
                let codec_desc = if (*codec).long_name.is_null() {
                    String::new()
                } else {
                    CStr::from_ptr((*codec).long_name)
                        .to_string_lossy()
                        .to_string()
                };
                println!("{} - {}", codec_name, codec_desc);
                encoder_count += 1;
            }

            println!();
            println!("encoder count: {}", encoder_count);
        }
    }
}
