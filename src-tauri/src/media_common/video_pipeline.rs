use crate::media_common::audio_transcode::{
    build_transcode_track_with_filter, AudioEncodingParams, AudioTrackConfig, AudioTranscodeTrack,
};
use crate::events::TaskEmitter;
use crate::services::ffmpeg::media_info::{MediaDetails, StreamDetails};
use crate::services::media_tools::watermark::WatermarkConfig;
use ffmpeg::{codec, encoder, format, frame, media, packet, picture, Dictionary, Rational};
use ffmpeg_next as ffmpeg;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct VideoPipelineResolveOptions {
    pub input_path: String,
    pub output_path: String,
    pub format: Option<String>,
    pub video_encoder: Option<String>,
    pub video_bitrate: Option<u32>,
    pub min_bitrate: Option<u32>,
    pub max_bitrate: Option<u32>,
    pub rc_mode: Option<String>,
    pub crf: Option<u32>,
    pub resolution: Option<String>,
    pub aspect_ratio: Option<String>,
    pub scaling_mode: Option<String>,
    pub frame_rate: Option<String>,
    pub gop_size: Option<u32>,
    pub preset: Option<String>,
    pub profile: Option<String>,
    pub tune: Option<String>,
    pub color_space: Option<String>,
    pub color_range: Option<String>,
    pub bit_depth: Option<u32>,
    pub crop: Option<String>,
    pub audio_tracks: Option<Vec<AudioTrackConfig>>,
    pub default_audio_params: Option<AudioEncodingParams>,
    pub audio_filter_spec: Option<String>,
    pub audio_encoder: Option<String>,
    pub use_hardware_acceleration: bool,
    pub use_ultra_fast_speed: bool,
    pub watermark: Option<WatermarkConfig>,
    pub forced_watermark: Option<WatermarkConfig>,
}

#[derive(Debug, Clone)]
pub struct ResolvedVideoPipelineParams {
    pub input_path: String,
    pub output_path: String,
    pub format: String,
    pub video_encoder: String,
    pub video_bitrate: Option<u32>,
    pub min_bitrate: Option<u32>,
    pub max_bitrate: Option<u32>,
    pub rc_mode: Option<String>,
    pub crf: Option<u32>,
    pub resolution: Option<String>,
    pub aspect_ratio: Option<String>,
    pub scaling_mode: Option<String>,
    pub frame_rate: Option<String>,
    pub gop_size: Option<u32>,
    pub preset: Option<String>,
    pub profile: Option<String>,
    pub tune: Option<String>,
    pub color_space: Option<String>,
    pub color_range: Option<String>,
    pub bit_depth: Option<u32>,
    pub crop: Option<String>,
    pub audio_tracks: Vec<AudioTranscodeTrack>,
    pub use_hardware_acceleration: bool,
    pub use_ultra_fast_speed: bool,
    pub watermark: Option<WatermarkConfig>,
    pub forced_watermark: Option<WatermarkConfig>,
}

#[derive(Debug, Clone)]
pub struct VideoCompressionResolveOptions {
    pub input_path: String,
    pub output_path: String,
    pub remove_audio: Option<bool>,
    pub audio_tracks: Option<Vec<AudioTrackConfig>>,
}

#[derive(Debug, Clone)]
pub struct ResolvedVideoCompressionParams {
    pub input_path: String,
    pub output_path: String,
    pub output_ext: String,
    pub keep_audio: bool,
    pub selected_audio_track: Option<AudioTrackConfig>,
    pub selected_audio_stream_index: Option<usize>,
}

#[derive(Debug, Clone)]
pub struct CompressStreamSelection {
    pub video_stream_index: usize,
    pub audio_stream_index: Option<usize>,
    pub audio_selection_failed: bool,
}

#[derive(Debug, Clone)]
pub struct VideoInputAnalysis {
    pub duration_seconds: f64,
    pub global_start_time: i64,
    pub input_audio_indices: Vec<usize>,
    pub best_video_stream_index: Option<usize>,
}

pub struct ConvertStreamInitResult<TTranscoder> {
    pub stream_mapping: Vec<isize>,
    pub ist_time_bases: Vec<ffmpeg::Rational>,
    pub transcoders: HashMap<usize, TTranscoder>,
    pub next_ost_index: usize,
}

pub struct BlackVideoEncoderBundle {
    pub encoder: encoder::Video,
    pub ost_idx: usize,
    pub encoder_time_base: Rational,
    pub width: u32,
    pub height: u32,
    pub frame_rate: Rational,
}

pub fn default_audio_codec_for_container(output_format: &str) -> Option<&'static str> {
    match output_format {
        "mp4" | "m4v" | "m4a" | "mov" | "3gp" | "3g2" => Some("aac"),
        "webm" => Some("libopus"),
        _ => None,
    }
}

pub fn resolve_output_format(
    requested_format: Option<&str>,
    output_path: &str,
    default_format: &str,
) -> String {
    requested_format
        .map(|s| s.to_lowercase())
        .or_else(|| {
            std::path::Path::new(output_path)
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase())
        })
        .unwrap_or_else(|| default_format.to_string())
}

pub fn resolve_video_encoder(requested_encoder: Option<&str>, default_encoder: &str) -> String {
    requested_encoder
        .map(|s| s.to_string())
        .unwrap_or_else(|| default_encoder.to_string())
}

pub fn resolve_audio_tracks_for_convert(
    default_audio_params: Option<AudioEncodingParams>,
    default_filter_spec: Option<String>,
    legacy_audio_encoder: Option<&str>,
    explicit_tracks: Option<&[AudioTrackConfig]>,
    input_audio_indices: &[usize],
    output_format: &str,
) -> Vec<AudioTranscodeTrack> {
    let mut default_encoding = default_audio_params.unwrap_or(AudioEncodingParams {
        codec: None,
        bitrate: None,
        sample_rate: None,
        channels: None,
        bit_depth: None,
        quality: None,
    });

    if let Some(enc) = legacy_audio_encoder {
        default_encoding.codec = Some(enc.to_string());
    }

    if default_encoding.codec.is_none() {
        if let Some(codec) = default_audio_codec_for_container(output_format) {
            default_encoding.codec = Some(codec.to_string());
        }
    }

    if let Some(configs) = explicit_tracks {
        let mut resolved = Vec::new();
        for (i, cfg) in configs.iter().enumerate() {
            let src_idx = cfg
                .source_stream_index
                .or_else(|| input_audio_indices.get(i).copied())
                .or_else(|| input_audio_indices.first().copied())
                .unwrap_or(0);
            let merged_encoding = AudioEncodingParams {
                codec: cfg
                    .encoding
                    .codec
                    .clone()
                    .or(default_encoding.codec.clone()),
                bitrate: cfg.encoding.bitrate.or(default_encoding.bitrate),
                sample_rate: cfg.encoding.sample_rate.or(default_encoding.sample_rate),
                channels: cfg.encoding.channels.or(default_encoding.channels),
                bit_depth: cfg.encoding.bit_depth.or(default_encoding.bit_depth),
                quality: cfg.encoding.quality.or(default_encoding.quality),
            };
            resolved.push(build_transcode_track_with_filter(
                src_idx,
                merged_encoding,
                cfg.filter_spec.clone().or(default_filter_spec.clone()),
            ));
        }
        resolved
    } else {
        input_audio_indices
            .iter()
            .map(|&idx| {
                build_transcode_track_with_filter(
                    idx,
                    default_encoding.clone(),
                    default_filter_spec.clone(),
                )
            })
            .collect()
    }
}

pub fn resolve_video_params_for_convert(
    options: VideoPipelineResolveOptions,
    input_audio_indices: &[usize],
) -> ResolvedVideoPipelineParams {
    let fmt = resolve_output_format(options.format.as_deref(), &options.output_path, "mp4");
    let video_encoder = resolve_video_encoder(options.video_encoder.as_deref(), "h264");
    let audio_tracks = resolve_audio_tracks_for_convert(
        options.default_audio_params.clone(),
        options.audio_filter_spec.clone(),
        options.audio_encoder.as_deref(),
        options.audio_tracks.as_deref(),
        input_audio_indices,
        fmt.as_str(),
    );

    ResolvedVideoPipelineParams {
        input_path: options.input_path,
        output_path: options.output_path,
        format: fmt,
        video_encoder,
        video_bitrate: options.video_bitrate,
        min_bitrate: options.min_bitrate,
        max_bitrate: options.max_bitrate,
        rc_mode: options.rc_mode,
        crf: options.crf,
        resolution: options.resolution,
        aspect_ratio: options.aspect_ratio,
        scaling_mode: options.scaling_mode,
        frame_rate: options.frame_rate,
        gop_size: options.gop_size,
        preset: options.preset,
        profile: options.profile,
        tune: options.tune,
        color_space: options.color_space,
        color_range: options.color_range,
        bit_depth: options.bit_depth,
        crop: options.crop,
        audio_tracks,
        use_hardware_acceleration: options.use_hardware_acceleration,
        use_ultra_fast_speed: options.use_ultra_fast_speed,
        watermark: options.watermark,
        forced_watermark: options.forced_watermark,
    }
}

pub fn resolve_video_params_for_compress(
    options: VideoCompressionResolveOptions,
) -> ResolvedVideoCompressionParams {
    let output_path = crate::media_common::ensure_unique_output_path(&options.output_path);
    let output_ext = std::path::Path::new(&output_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();

    let selected_audio_track = options
        .audio_tracks
        .as_ref()
        .and_then(|tracks| tracks.first().cloned());
    let keep_audio = !options.remove_audio.unwrap_or(false)
        && options
            .audio_tracks
            .as_ref()
            .map(|tracks| !tracks.is_empty())
            .unwrap_or(true);
    let selected_audio_stream_index =
        selected_audio_track.as_ref().and_then(|track| track.source_stream_index);

    ResolvedVideoCompressionParams {
        input_path: options.input_path,
        output_path,
        output_ext,
        keep_audio,
        selected_audio_track,
        selected_audio_stream_index,
    }
}

pub fn media_duration_seconds(ictx: &format::context::Input) -> f64 {
    ictx.duration() as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
}

pub fn detect_global_start_time(ictx: &format::context::Input) -> i64 {
    ictx.streams()
        .map(|s| s.start_time())
        .filter(|&t| t != ffmpeg::ffi::AV_NOPTS_VALUE)
        .min()
        .unwrap_or(0)
}

pub fn collect_input_audio_indices(ictx: &format::context::Input) -> Vec<usize> {
    ictx.streams()
        .enumerate()
        .filter_map(|(i, s)| {
            if s.parameters().medium() == media::Type::Audio {
                Some(i)
            } else {
                None
            }
        })
        .collect()
}

pub fn best_video_stream_index(ictx: &format::context::Input) -> Option<usize> {
    ictx.streams().best(media::Type::Video).map(|s| s.index())
}

pub fn resolve_audio_stream_index(
    ictx: &format::context::Input,
    selected_stream_index: Option<usize>,
) -> Option<usize> {
    selected_stream_index
        .and_then(|index| {
            ictx.stream(index).and_then(|stream| {
                if stream.parameters().medium() == media::Type::Audio {
                    Some(index)
                } else {
                    None
                }
            })
        })
        .or_else(|| ictx.streams().best(media::Type::Audio).map(|s| s.index()))
}

pub fn resolve_compress_stream_selection(
    ictx: &format::context::Input,
    resolved: &ResolvedVideoCompressionParams,
) -> Result<CompressStreamSelection, String> {
    let video_stream_index = best_video_stream_index(ictx).ok_or("No Video Stream")?;

    let selected_stream_index = resolved.selected_audio_stream_index;
    let audio_stream_index = if resolved.keep_audio {
        resolve_audio_stream_index(ictx, selected_stream_index)
    } else {
        None
    };

    let audio_selection_failed =
        resolved.keep_audio && selected_stream_index.is_some() && audio_stream_index.is_none();

    Ok(CompressStreamSelection {
        video_stream_index,
        audio_stream_index,
        audio_selection_failed,
    })
}

pub fn analyze_video_input(ictx: &format::context::Input) -> VideoInputAnalysis {
    VideoInputAnalysis {
        duration_seconds: media_duration_seconds(ictx),
        global_start_time: detect_global_start_time(ictx),
        input_audio_indices: collect_input_audio_indices(ictx),
        best_video_stream_index: best_video_stream_index(ictx),
    }
}

pub fn create_black_video_encoder(
    octx: &mut format::context::Output,
    params: &ResolvedVideoPipelineParams,
) -> Result<BlackVideoEncoderBundle, String> {
    let global_header = octx.format().flags().contains(format::Flags::GLOBAL_HEADER);

    let codec = crate::media_common::select_video_encoder(
        Some(params.video_encoder.as_str()),
        params.use_hardware_acceleration,
    )
    .or_else(|| ffmpeg::encoder::find(codec::Id::H264))
    .ok_or("未找到合适的视频编码器")?;
    let codec_id = codec.id();

    let mut ost = octx
        .add_stream(codec)
        .map_err(|e| format!("无法添加输出流: {}", e))?;

    let mut encoder = codec::context::Context::new_with_codec(codec)
        .encoder()
        .video()
        .map_err(|e| format!("无法创建视频编码器: {}", e))?;

    let (width, height) =
        crate::media_common::resolve_resolution(1920, 1080, params.resolution.as_deref());

    encoder.set_width(width);
    encoder.set_height(height);
    encoder.set_format(crate::media_common::pick_pixel_format_for_codec(
        params.bit_depth,
        params.use_hardware_acceleration,
        codec,
    ));

    let fps = if let Some(fps_str) = &params.frame_rate {
        if fps_str != "original" {
            fps_str.parse::<i32>().unwrap_or(30)
        } else {
            30
        }
    } else {
        30
    };
    encoder.set_frame_rate(Some((fps, 1)));

    let encoder_time_base = Rational(1, fps);
    encoder.set_time_base(encoder_time_base);

    let is_crf = params.rc_mode.as_deref() == Some("crf");
    if !is_crf {
        if let Some(bitrate) = params.video_bitrate {
            encoder.set_bit_rate((bitrate * 1000) as usize);
        }
    } else {
        encoder.set_bit_rate(500 * 1000);
    }

    if global_header {
        encoder.set_flags(codec::Flags::GLOBAL_HEADER);
    }

    let mut opts = Dictionary::new();
    if !params.use_hardware_acceleration {
        if params.use_ultra_fast_speed {
            opts.set("preset", "ultrafast");
        } else {
            opts.set("preset", "medium");
        }
    } else if cfg!(target_os = "macos") {
    }

    let encoder = encoder
        .open_with(opts)
        .map_err(|e| format!("无法打开编码器: {}", e))?;

    ost.set_parameters(&encoder);
    crate::media_common::video_transcode::force_hevc_hvc1_tag(&mut ost, codec_id, params.format.as_str());
    let encoder_time_base = if encoder.time_base().numerator() > 0 {
        let tb = encoder.time_base();
        ost.set_time_base(tb);
        tb
    } else {
        ost.set_time_base(encoder_time_base);
        encoder_time_base
    };

    Ok(BlackVideoEncoderBundle {
        encoder,
        ost_idx: ost.index(),
        encoder_time_base,
        width,
        height,
        frame_rate: Rational(fps, 1),
    })
}

pub fn build_black_video_stream_details(
    bundle: &BlackVideoEncoderBundle,
    params: &ResolvedVideoPipelineParams,
) -> StreamDetails {
    let codec_name = bundle
        .encoder
        .codec()
        .map(|c| c.name().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let bit_rate = if params.rc_mode.as_deref() == Some("crf") {
        Some(500_000)
    } else {
        params.video_bitrate.map(|v| (v as i64) * 1000)
    };

    StreamDetails {
        index: bundle.ost_idx,
        codec_type: "video".to_string(),
        codec_name,
        codec_long_name: None,
        time_base: Some(format!(
            "{}/{}",
            bundle.encoder_time_base.numerator(),
            bundle.encoder_time_base.denominator()
        )),
        pix_fmt: bundle
            .encoder
            .format()
            .descriptor()
            .map(|desc| desc.name().to_string())
            .or_else(|| Some(format!("{:?}", bundle.encoder.format()))),
        width: Some(bundle.width),
        height: Some(bundle.height),
        frame_rate: crate::media_common::video_transcode::rational_to_rate_string(bundle.frame_rate),
        channels: None,
        sample_rate: None,
        bit_rate,
        bit_depth: None,
        bits_per_sample: None,
    }
}

pub fn generate_black_video_frames<E: TaskEmitter>(
    bundle: &mut BlackVideoEncoderBundle,
    octx: &mut format::context::Output,
    ost_time_base: Rational,
    duration: f64,
    emitter: &E,
) -> Result<u64, String> {
    let fps = bundle.frame_rate.numerator() as f64 / bundle.frame_rate.denominator() as f64;
    let total_frames = (duration * fps).ceil() as i64;

    let mut black_frame = frame::Video::empty();
    black_frame.set_format(bundle.encoder.format());
    black_frame.set_width(bundle.width);
    black_frame.set_height(bundle.height);

    unsafe {
        let frame_ptr = black_frame.as_mut_ptr();
        let result = ffmpeg::ffi::av_frame_get_buffer(frame_ptr, 32);
        if result < 0 {
            return Err(format!("无法分配黑屏帧缓冲区: {}", result));
        }
    }

    unsafe {
        let frame_ptr = black_frame.as_mut_ptr();
        let pixel_format = black_frame.format();

        if pixel_format == ffmpeg::format::Pixel::NV12 {
            let y_plane = (*frame_ptr).data[0] as *mut u8;
            let uv_plane = (*frame_ptr).data[1] as *mut u8;
            let y_stride = (*frame_ptr).linesize[0] as usize;
            let uv_stride = (*frame_ptr).linesize[1] as usize;

            for y in 0..bundle.height {
                let offset = (y as usize) * y_stride;
                let slice = std::slice::from_raw_parts_mut(y_plane.add(offset), bundle.width as usize);
                slice.fill(0);
            }

            let uv_width = (bundle.width / 2) as usize;
            let uv_height = (bundle.height / 2) as usize;
            for y in 0..uv_height {
                let offset = (y as usize) * uv_stride;
                let slice = std::slice::from_raw_parts_mut(uv_plane.add(offset), uv_width * 2);
                for i in 0..uv_width {
                    slice[i * 2] = 128;
                    slice[i * 2 + 1] = 128;
                }
            }
        } else {
            let y_plane = (*frame_ptr).data[0] as *mut u8;
            let u_plane = (*frame_ptr).data[1] as *mut u8;
            let v_plane = (*frame_ptr).data[2] as *mut u8;
            let y_stride = (*frame_ptr).linesize[0] as usize;
            let u_stride = (*frame_ptr).linesize[1] as usize;
            let v_stride = (*frame_ptr).linesize[2] as usize;

            for y in 0..bundle.height {
                let offset = (y as usize) * y_stride;
                let slice = std::slice::from_raw_parts_mut(y_plane.add(offset), bundle.width as usize);
                slice.fill(0);
            }

            let uv_width = (bundle.width / 2) as usize;
            let uv_height = (bundle.height / 2) as usize;
            for y in 0..uv_height {
                let u_offset = (y as usize) * u_stride;
                let v_offset = (y as usize) * v_stride;
                let u_slice = std::slice::from_raw_parts_mut(u_plane.add(u_offset), uv_width);
                let v_slice = std::slice::from_raw_parts_mut(v_plane.add(v_offset), uv_width);
                u_slice.fill(128);
                v_slice.fill(128);
            }
        }
    }

    let mut frame_count = 0i64;
    let mut last_progress_emitted = 0.0;
    let mut written_bytes = 0u64;

    for frame_num in 0..total_frames {
        black_frame.set_pts(Some(frame_num));
        black_frame.set_kind(picture::Type::None);

        bundle
            .encoder
            .send_frame(&black_frame)
            .map_err(|e| format!("发送黑屏帧失败: {}", e))?;

        let mut encoded = packet::Packet::empty();
        while bundle.encoder.receive_packet(&mut encoded).is_ok() {
            let packet_size = encoded.size() as u64;
            encoded.set_stream(bundle.ost_idx);
            encoded.rescale_ts(bundle.encoder_time_base, ost_time_base);
            encoded
                .write_interleaved(octx)
                .map_err(|e| format!("写入黑屏数据包失败: {}", e))?;
            written_bytes = written_bytes.saturating_add(packet_size);
        }

        frame_count += 1;

        if frame_count % 30 == 0 || frame_num % (fps as i64) == 0 {
            if crate::task::cancel::is_cancelled() {
                return Err("Task cancelled".to_string());
            }
            let progress = if duration > 0.0 {
                let current_time = frame_num as f64 / fps;
                ((current_time / duration) * 100.0).min(100.0)
            } else {
                0.0
            };

            if (progress - last_progress_emitted).abs() >= 1.0 {
                emitter.emit("progress", Some(progress), None, None);
                last_progress_emitted = progress;
            }
        }
    }

    bundle
        .encoder
        .send_eof()
        .map_err(|e| format!("发送 EOF 到黑屏编码器失败: {}", e))?;

    let mut encoded = packet::Packet::empty();
    while bundle.encoder.receive_packet(&mut encoded).is_ok() {
        let packet_size = encoded.size() as u64;
        encoded.set_stream(bundle.ost_idx);
        encoded.rescale_ts(bundle.encoder_time_base, ost_time_base);
        encoded
            .write_interleaved(octx)
            .map_err(|e| format!("写入最终黑屏数据包失败: {}", e))?;
        written_bytes = written_bytes.saturating_add(packet_size);
    }

    Ok(written_bytes)
}

pub fn init_convert_streams<TTranscoder, F>(
    ictx: &format::context::Input,
    initial_ost_index: usize,
    best_video_stream: Option<usize>,
    audio_map: &HashMap<usize, Vec<usize>>,
    mut create_transcoder: F,
) -> Result<ConvertStreamInitResult<TTranscoder>, String>
where
    F: FnMut(usize, &format::stream::Stream, usize) -> Result<TTranscoder, String>,
{
    let mut stream_mapping: Vec<isize> = vec![0; ictx.nb_streams() as usize];
    let mut ist_time_bases = vec![ffmpeg::Rational(0, 1); ictx.nb_streams() as usize];
    let mut transcoders = HashMap::new();
    let mut ost_index = initial_ost_index;

    for (ist_index, ist) in ictx.streams().enumerate() {
        let ist_medium = ist.parameters().medium();
        ist_time_bases[ist_index] = ist.time_base();

        if ist_medium == media::Type::Video {
            if let Some(video_idx) = best_video_stream {
                if ist_index == video_idx {
                    stream_mapping[ist_index] = ost_index as isize;
                    let transcoder = create_transcoder(ist_index, &ist, ost_index)?;
                    transcoders.insert(ist_index, transcoder);
                    ost_index += 1;
                } else {
                    stream_mapping[ist_index] = -1;
                }
            } else {
                stream_mapping[ist_index] = -1;
            }
        } else if ist_medium == media::Type::Audio {
            if audio_map.contains_key(&ist_index) {
                stream_mapping[ist_index] = -2;
            } else {
                stream_mapping[ist_index] = -1;
            }
        } else {
            stream_mapping[ist_index] = -1;
        }
    }

    Ok(ConvertStreamInitResult {
        stream_mapping,
        ist_time_bases,
        transcoders,
        next_ost_index: ost_index,
    })
}

pub fn write_header_with_stream_dump(
    octx: &mut format::context::Output,
    log_prefix: &str,
    error_prefix: &str,
) -> Result<(), String> {
    if let Err(err) = octx.write_header() {
        for i in 0..octx.nb_streams() {
            if let Some(stream) = octx.stream(i as usize) {
                let params = stream.parameters();
                log::error!(
                    "{} stream dump: idx={} medium={:?} codec_id={:?} tb={}/{}",
                    log_prefix,
                    i,
                    params.medium(),
                    params.id(),
                    stream.time_base().numerator(),
                    stream.time_base().denominator()
                );
            }
        }
        return Err(format!("{}: {}", error_prefix, err));
    }
    Ok(())
}

pub fn write_header_and_sync_processors<TVideoProcessor, TAudioProcessor, FVideoSync, FAudioSync>(
    octx: &mut format::context::Output,
    log_prefix: &str,
    error_prefix: &str,
    video_proc: &mut TVideoProcessor,
    audio_proc: &mut Option<TAudioProcessor>,
    mut sync_video: FVideoSync,
    mut sync_audio: FAudioSync,
) -> Result<(), String>
where
    FVideoSync: FnMut(&mut TVideoProcessor, &format::context::Output),
    FAudioSync: FnMut(&mut TAudioProcessor, &format::context::Output),
{
    write_header_with_stream_dump(octx, log_prefix, error_prefix)?;
    sync_video(video_proc, octx);
    if let Some(audio) = audio_proc.as_mut() {
        sync_audio(audio, octx);
    }
    Ok(())
}

pub fn build_output_media(
    output_path: String,
    format_names: String,
    duration: f64,
    size: u64,
    streams: Vec<StreamDetails>,
) -> MediaDetails {
    MediaDetails {
        path: output_path.clone(),
        extension: std::path::Path::new(&output_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default(),
        format_names,
        format_long_name: None,
        duration,
        size,
        streams,
        tags: HashMap::new(),
        stream_tags: Vec::new(),
    }
}

#[derive(Debug, Clone)]
pub struct CompressFinalizeSummary {
    pub total_written_bytes: u64,
    pub streams: Vec<StreamDetails>,
    pub estimated_avg_bitrate: Option<i64>,
    pub target_total_bitrate: usize,
    pub estimated_target_size: Option<u64>,
}

pub fn build_compress_finalize_summary(
    duration: f64,
    video_written_bytes: u64,
    video_stream: StreamDetails,
    video_target_bitrate: usize,
    audio_written_bytes: Option<u64>,
    audio_stream: Option<StreamDetails>,
    audio_target_bitrate: Option<usize>,
) -> CompressFinalizeSummary {
    let mut total_written_bytes = video_written_bytes;
    let mut streams = vec![video_stream];

    if let Some(bytes) = audio_written_bytes {
        total_written_bytes = total_written_bytes.saturating_add(bytes);
    }
    if let Some(stream) = audio_stream {
        streams.push(stream);
    }
    streams.sort_by_key(|s| s.index);

    let estimated_avg_bitrate = if duration > 0.0 {
        Some(((total_written_bytes as f64 * 8.0) / duration) as i64)
    } else {
        None
    };
    let target_total_bitrate = video_target_bitrate + audio_target_bitrate.unwrap_or(0);
    let estimated_target_size = if duration > 0.0 {
        Some(((target_total_bitrate as f64 * duration) / 8.0) as u64)
    } else {
        None
    };

    CompressFinalizeSummary {
        total_written_bytes,
        streams,
        estimated_avg_bitrate,
        target_total_bitrate,
        estimated_target_size,
    }
}

pub fn emit_complete_with_path<E: TaskEmitter>(
    emitter: &E,
    output_path: &str,
) {
    emitter.emit(
        "complete",
        Some(100.0),
        Some(output_path.to_string()),
        None,
    );
}

pub fn log_video_pipeline_summary(
    log_prefix: &str,
    output_path: &str,
    duration: f64,
    written_bytes: u64,
    avg_bitrate_bps: Option<i64>,
    target_total_bitrate_bps: Option<usize>,
    estimated_target_size_bytes: Option<u64>,
) {
    log::info!(
        "{} done: output={} duration={:.3}s written_bytes={} avg_bitrate_bps={:?} target_total_bitrate_bps={:?} estimated_target_size_bytes={:?}",
        log_prefix,
        output_path,
        duration,
        written_bytes,
        avg_bitrate_bps,
        target_total_bitrate_bps,
        estimated_target_size_bytes
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_video_stream(index: usize) -> StreamDetails {
        StreamDetails {
            index,
            codec_type: "video".to_string(),
            codec_name: "h264".to_string(),
            codec_long_name: None,
            time_base: Some("1/30".to_string()),
            pix_fmt: Some("yuv420p".to_string()),
            width: Some(1920),
            height: Some(1080),
            frame_rate: Some("30/1".to_string()),
            channels: None,
            sample_rate: None,
            bit_rate: Some(2_000_000),
            bit_depth: None,
            bits_per_sample: None,
        }
    }

    fn make_audio_stream(index: usize) -> StreamDetails {
        StreamDetails {
            index,
            codec_type: "audio".to_string(),
            codec_name: "aac".to_string(),
            codec_long_name: None,
            time_base: Some("1/48000".to_string()),
            pix_fmt: None,
            width: None,
            height: None,
            frame_rate: None,
            channels: Some(2),
            sample_rate: Some(48_000),
            bit_rate: Some(128_000),
            bit_depth: Some(16),
            bits_per_sample: Some(16),
        }
    }

    #[test]
    fn test_resolve_output_format_prefers_requested() {
        let format = resolve_output_format(Some("mkv"), "output.mp4", "mp4");
        assert_eq!(format, "mkv");
    }

    #[test]
    fn test_resolve_output_format_falls_back_to_extension() {
        let format = resolve_output_format(None, "output.webm", "mp4");
        assert_eq!(format, "webm");
    }

    #[test]
    fn test_resolve_output_format_falls_back_to_default() {
        let format = resolve_output_format(None, "output", "mp4");
        assert_eq!(format, "mp4");
    }

    #[test]
    fn test_resolve_video_encoder_uses_default_when_missing() {
        let encoder = resolve_video_encoder(None, "h264");
        assert_eq!(encoder, "h264");
    }

    #[test]
    fn test_build_compress_finalize_summary_with_audio() {
        let summary = build_compress_finalize_summary(
            10.0,
            1_000_000,
            make_video_stream(1),
            1_600_000,
            Some(200_000),
            Some(make_audio_stream(0)),
            Some(128_000),
        );

        assert_eq!(summary.total_written_bytes, 1_200_000);
        assert_eq!(summary.streams.len(), 2);
        assert_eq!(summary.streams[0].index, 0);
        assert_eq!(summary.streams[1].index, 1);
        assert_eq!(summary.target_total_bitrate, 1_728_000);
        assert_eq!(summary.estimated_target_size, Some(2_160_000));
        assert_eq!(summary.estimated_avg_bitrate, Some(960_000));
    }

    #[test]
    fn test_build_compress_finalize_summary_without_audio() {
        let summary = build_compress_finalize_summary(
            8.0,
            800_000,
            make_video_stream(0),
            1_200_000,
            None,
            None,
            None,
        );

        assert_eq!(summary.total_written_bytes, 800_000);
        assert_eq!(summary.streams.len(), 1);
        assert_eq!(summary.target_total_bitrate, 1_200_000);
        assert_eq!(summary.estimated_target_size, Some(1_200_000));
        assert_eq!(summary.estimated_avg_bitrate, Some(800_000));
    }
}

pub struct ConvertPacketStageContext<'a, TTranscoder, TAudioProcessor> {
    pub ictx: &'a mut format::context::Input,
    pub octx: &'a mut format::context::Output,
    pub stream_mapping: &'a [isize],
    pub ist_time_bases: &'a [ffmpeg::Rational],
    pub ost_time_bases: &'a [ffmpeg::Rational],
    pub audio_map: &'a HashMap<usize, Vec<usize>>,
    pub audio_processors: &'a mut [TAudioProcessor],
    pub transcoders: &'a mut HashMap<usize, TTranscoder>,
    pub stream_copy_bytes: &'a mut u64,
}

pub struct ConvertDrainStageContext<'a, TTranscoder, TAudioProcessor> {
    pub octx: &'a mut format::context::Output,
    pub stream_mapping: &'a [isize],
    pub ost_time_bases: &'a [ffmpeg::Rational],
    pub transcoders: &'a mut HashMap<usize, TTranscoder>,
    pub audio_processors: &'a mut [TAudioProcessor],
}

pub struct CompressPacketStageContext<'a, TVideoProcessor, TAudioProcessor> {
    pub ictx: &'a mut format::context::Input,
    pub octx: &'a mut format::context::Output,
    pub video_idx: usize,
    pub video_proc: &'a mut TVideoProcessor,
    pub audio_proc: &'a mut Option<TAudioProcessor>,
}

pub struct CompressDrainStageContext<'a, TVideoProcessor, TAudioProcessor> {
    pub octx: &'a mut format::context::Output,
    pub video_proc: &'a mut TVideoProcessor,
    pub audio_proc: &'a mut Option<TAudioProcessor>,
}
