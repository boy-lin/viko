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
        }
    }
}

