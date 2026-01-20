use ffmpeg_next as ffmpeg;
use ffmpeg::format::sample::Type as SampleType;
use ffmpeg::util::channel_layout::ChannelLayout;
use ffmpeg::util::format::Sample;

pub fn ensure_ffmpeg_init() -> Result<(), String> {
    ffmpeg::init().map_err(|e| format!("FFmpeg 初始化失败: {}", e))
}

pub fn get_audio_duration(input_path: &str) -> Result<f64, String> {
    ensure_ffmpeg_init()?;

    let ictx = ffmpeg::format::input(input_path).map_err(|e| format!("打开文件失败: {}", e))?;

    let duration = if let Some(audio_stream) = ictx.streams().best(ffmpeg::media::Type::Audio) {
        let time_base = audio_stream.time_base();
        let duration_ts = audio_stream.duration();
        if duration_ts > 0 {
            duration_ts as f64 * time_base.numerator() as f64 / time_base.denominator() as f64
        } else {
            let dur_raw = ictx.duration();
            if dur_raw > 0 && dur_raw != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
                dur_raw as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
            } else {
                0.0
            }
        }
    } else {
        let dur_raw = ictx.duration();
        if dur_raw > 0 && dur_raw != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
            dur_raw as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
        } else {
            0.0
        }
    };

    Ok(duration)
}

pub fn preferred_sample_from_bit_depth(
    bit_depth: Option<u32>,
    format_hint: Option<&str>,
) -> Sample {
    match bit_depth {
        Some(16) => Sample::I16(SampleType::Packed),
        Some(24) => Sample::I32(SampleType::Packed),
        Some(32) => Sample::F32(SampleType::Packed),
        _ => match format_hint {
            Some("wav") | Some("flac") => Sample::I16(SampleType::Packed),
            _ => Sample::F32(SampleType::Planar),
        },
    }
}

pub fn pick_sample_format(encoder_codec: &ffmpeg::Codec, preferred: Sample) -> Sample {
    if let Ok(audio) = encoder_codec.audio() {
        if let Some(formats) = audio.formats() {
            let supported: Vec<Sample> = formats.collect();
            for candidate in [
                preferred,
                preferred.planar(),
                preferred.packed(),
                Sample::F32(SampleType::Planar),
                Sample::F32(SampleType::Packed),
            ] {
                if supported.iter().any(|f| *f == candidate) {
                    return candidate;
                }
            }
            if let Some(first) = supported.first() {
                return *first;
            }
        }
    }
    preferred
}

pub fn pick_channel_layout(
    encoder_codec: &ffmpeg::Codec,
    desired: Option<ChannelLayout>,
    input_layout: ChannelLayout,
) -> ChannelLayout {
    let wanted = desired.unwrap_or_else(|| {
        if input_layout.is_empty() {
            ChannelLayout::STEREO
        } else {
            input_layout
        }
    });
    if let Ok(audio) = encoder_codec.audio() {
        if let Some(layouts) = audio.channel_layouts() {
            let mut collected = Vec::new();
            for l in layouts {
                if l == wanted {
                    return wanted;
                }
                collected.push(l);
            }
            if let Some(best) = collected.iter().find(|l| l.channels() == wanted.channels()) {
                return *best;
            }
            if let Some(first) = collected.first() {
                return *first;
            }
        }
    }
    wanted
}

pub fn pick_sample_rate(encoder_codec: &ffmpeg::Codec, requested: u32, fallback: u32) -> u32 {
    if let Ok(audio) = encoder_codec.audio() {
        if let Some(rates) = audio.rates() {
            let supported: Vec<i32> = rates.collect();
            if supported.is_empty() {
                return requested.max(1);
            }
            if supported.iter().any(|r| *r == requested as i32) {
                return requested;
            }
            if let Some(best) =
                supported.iter().min_by_key(|r| (requested as i32 - **r).abs())
            {
                return *best as u32;
            }
        }
    }
    if requested > 0 {
        requested
    } else {
        fallback
    }
}

pub fn channel_layout_from_count(ch: u32) -> Option<ChannelLayout> {
    match ch {
        1 => Some(ChannelLayout::MONO),
        2 => Some(ChannelLayout::STEREO),
        _ => None,
    }
}
