use ffmpeg_next as ffmpeg;
use image::imageops::{crop_imm, resize, FilterType};
use image::{ImageFormat, RgbImage};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
};

use crate::media_common;
use crate::media_common::MediaFileType;

const THUMBNAIL_MAX_CONCURRENCY: usize = 3;
const THUMBNAIL_CACHE_CAPACITY: usize = 256;
const THUMBNAIL_CACHE_TTL_SECONDS: u64 = 300;
const THUMBNAIL_MAX_WIDTH: u32 = 1280;
const THUMBNAIL_MAX_HEIGHT: u32 = 720;

type ThumbnailResponse = Result<Option<ThumbnailResult>, String>;

lazy_static::lazy_static! {
    static ref THUMBNAIL_GATE: ThumbnailGate = ThumbnailGate::new(THUMBNAIL_MAX_CONCURRENCY);
    static ref THUMBNAIL_CACHE: Mutex<ThumbnailCache> =
        Mutex::new(ThumbnailCache::new(THUMBNAIL_CACHE_CAPACITY));
    static ref THUMBNAIL_IN_FLIGHT: Mutex<HashMap<String, Arc<InFlightWaiter>>> =
        Mutex::new(HashMap::new());
}

struct ThumbnailGate {
    state: Mutex<GateState>,
    cv: Condvar,
    max: usize,
}

#[derive(Default)]
struct GateState {
    active: usize,
    queue: VecDeque<u64>,
    next_ticket: u64,
}

impl ThumbnailGate {
    fn new(max: usize) -> Self {
        Self {
            state: Mutex::new(GateState::default()),
            cv: Condvar::new(),
            max: max.max(1),
        }
    }

    fn acquire(&self) -> ThumbnailPermit<'_> {
        let mut state = self.state.lock().unwrap();
        let ticket = state.next_ticket;
        state.next_ticket = state.next_ticket.wrapping_add(1);
        state.queue.push_back(ticket);

        while state.active >= self.max || state.queue.front().copied() != Some(ticket) {
            state = self.cv.wait(state).unwrap();
        }
        state.active += 1;
        state.queue.pop_front();
        ThumbnailPermit { gate: self }
    }

    fn release(&self) {
        let mut state = self.state.lock().unwrap();
        if state.active > 0 {
            state.active -= 1;
        }
        self.cv.notify_all();
    }
}

struct ThumbnailPermit<'a> {
    gate: &'a ThumbnailGate,
}

impl Drop for ThumbnailPermit<'_> {
    fn drop(&mut self) {
        self.gate.release();
    }
}

#[derive(Default)]
struct InFlightWaiter {
    result: Mutex<Option<ThumbnailResponse>>,
    cv: Condvar,
}

impl InFlightWaiter {
    fn complete(&self, result: ThumbnailResponse) {
        let mut slot = self.result.lock().unwrap();
        *slot = Some(result);
        self.cv.notify_all();
    }

    fn wait(&self) -> ThumbnailResponse {
        let mut slot = self.result.lock().unwrap();
        while slot.is_none() {
            slot = self.cv.wait(slot).unwrap();
        }
        slot.clone().unwrap_or_else(|| Ok(None))
    }
}

struct ThumbnailCache {
    capacity: usize,
    ttl: Duration,
    map: HashMap<String, CacheEntry>,
    order: VecDeque<String>,
}

#[derive(Clone)]
struct CacheEntry {
    value: ThumbnailResponse,
    cached_at: Instant,
}

impl ThumbnailCache {
    fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            ttl: Duration::from_secs(THUMBNAIL_CACHE_TTL_SECONDS),
            map: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    fn get(&mut self, key: &str) -> Option<ThumbnailResponse> {
        self.prune_expired();

        if let Some(entry) = self.map.get(key) {
            if entry.cached_at.elapsed() > self.ttl {
                self.remove_key(key);
                return None;
            }
            if let Ok(Some(result)) = &entry.value {
                if !result.thumbnail_path.is_empty() && !Path::new(&result.thumbnail_path).exists()
                {
                    self.remove_key(key);
                    return None;
                }
            }
            let value = entry.value.clone();
            self.touch(key);
            return Some(value);
        }
        None
    }

    fn insert(&mut self, key: String, value: ThumbnailResponse) {
        self.prune_expired();

        if self.map.contains_key(&key) {
            self.map.insert(
                key.clone(),
                CacheEntry {
                    value,
                    cached_at: Instant::now(),
                },
            );
            self.touch(&key);
            return;
        }

        self.map.insert(
            key.clone(),
            CacheEntry {
                value,
                cached_at: Instant::now(),
            },
        );
        self.order.push_back(key);

        while self.map.len() > self.capacity {
            if let Some(oldest) = self.order.pop_front() {
                if let Some(entry) = self.map.remove(&oldest) {
                    cleanup_thumbnail_file_from_response(&entry.value);
                }
            } else {
                break;
            }
        }
    }

    fn touch(&mut self, key: &str) {
        if let Some(pos) = self.order.iter().position(|k| k == key) {
            self.order.remove(pos);
        }
        self.order.push_back(key.to_string());
    }

    fn remove_key(&mut self, key: &str) {
        if let Some(entry) = self.map.remove(key) {
            cleanup_thumbnail_file_from_response(&entry.value);
        }
        if let Some(pos) = self.order.iter().position(|k| k == key) {
            self.order.remove(pos);
        }
    }

    fn prune_expired(&mut self) {
        let ttl = self.ttl;
        let expired_keys: Vec<String> = self
            .map
            .iter()
            .filter_map(|(k, v)| {
                if v.cached_at.elapsed() > ttl {
                    Some(k.clone())
                } else {
                    None
                }
            })
            .collect();
        for key in expired_keys {
            self.remove_key(&key);
        }
    }
}

fn cleanup_thumbnail_file_from_response(resp: &ThumbnailResponse) {
    if let Ok(Some(result)) = resp {
        if !result.thumbnail_path.is_empty() {
            let _ = fs::remove_file(&result.thumbnail_path);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailOptions {
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// 截取视频指定时间点(秒)
    pub time: Option<f64>,
    /// contain(默认): 等比缩放完整显示; cover: 等比放大后居中裁切
    pub fit_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailResult {
    pub thumbnail_path: String,
    pub data_url: Option<String>,
    pub width: u32,
    pub height: u32,
}

/// Generate a base64 encoded thumbnail for the given media file.
/// For video: extracts the first frame.
/// For audio: extracts attached picture (cover art).
pub fn generate_thumbnail(
    path: &str,
    options: Option<ThumbnailOptions>,
) -> Result<Option<ThumbnailResult>, String> {
    let input_path = Path::new(path);
    if !input_path.exists() {
        return Err(format!("文件不存在: {}", path));
    }

    let requested_width = options.as_ref().and_then(|o| o.width);
    let requested_height = options.as_ref().and_then(|o| o.height);
    let requested_time_us = options
        .as_ref()
        .and_then(|o| o.time)
        .filter(|t| t.is_finite() && *t >= 0.0)
        .map(|t| (t * ffmpeg::ffi::AV_TIME_BASE as f64).round() as i64);
    let fit_mode = options
        .as_ref()
        .and_then(|o| o.fit_mode.as_deref())
        .unwrap_or("contain")
        .to_ascii_lowercase();

    let cache_key = build_thumbnail_cache_key(
        input_path,
        requested_width,
        requested_height,
        requested_time_us,
        &fit_mode,
    );

    if let Some(hit) = THUMBNAIL_CACHE.lock().unwrap().get(&cache_key) {
        return hit;
    }

    let (waiter, owner) = {
        let mut in_flight = THUMBNAIL_IN_FLIGHT.lock().unwrap();
        if let Some(existing) = in_flight.get(&cache_key) {
            (existing.clone(), false)
        } else {
            let created = Arc::new(InFlightWaiter::default());
            in_flight.insert(cache_key.clone(), created.clone());
            (created, true)
        }
    };

    if !owner {
        return waiter.wait();
    }

    let _permit = THUMBNAIL_GATE.acquire();
    let result = generate_thumbnail_inner(
        path,
        requested_width,
        requested_height,
        requested_time_us,
        fit_mode.as_str(),
        &cache_key,
    );

    if let Ok(value) = &result {
        THUMBNAIL_CACHE
            .lock()
            .unwrap()
            .insert(cache_key.clone(), Ok(value.clone()));
    }

    waiter.complete(result.clone());
    THUMBNAIL_IN_FLIGHT.lock().unwrap().remove(&cache_key);
    result
}

fn generate_thumbnail_inner(
    path: &str,
    requested_width: Option<u32>,
    requested_height: Option<u32>,
    requested_time_us: Option<i64>,
    fit_mode: &str,
    cache_key: &str,
) -> Result<Option<ThumbnailResult>, String> {
    let input_path = Path::new(path);
    let file_type = media_common::detect_media_file_type(input_path);
    match file_type {
        MediaFileType::Image => {
            generate_image_thumbnail(path, requested_width, requested_height, fit_mode, cache_key)
                .map(Some)
        }
        MediaFileType::Video | MediaFileType::Audio => generate_video_stream_thumbnail(
            path,
            requested_width,
            requested_height,
            requested_time_us,
            fit_mode,
            cache_key,
        ),
        MediaFileType::Unknown => {
            if let Some(result) = generate_video_stream_thumbnail(
                path,
                requested_width,
                requested_height,
                requested_time_us,
                fit_mode,
                cache_key,
            )? {
                return Ok(Some(result));
            }
            if let Ok(result) = generate_image_thumbnail(
                path,
                requested_width,
                requested_height,
                fit_mode,
                cache_key,
            ) {
                return Ok(Some(result));
            }
            Ok(None)
        }
    }
}

fn build_thumbnail_cache_key(
    path: &Path,
    requested_width: Option<u32>,
    requested_height: Option<u32>,
    requested_time_us: Option<i64>,
    fit_mode: &str,
) -> String {
    let (size, mtime_ms) = match fs::metadata(path) {
        Ok(meta) => {
            let len = meta.len();
            let modified_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis())
                .unwrap_or(0);
            (len, modified_ms)
        }
        Err(_) => (0, 0),
    };

    format!(
        "{}|w={:?}|h={:?}|t={:?}|fit={}|size={}|mtime={}",
        path.to_string_lossy(),
        requested_width,
        requested_height,
        requested_time_us,
        fit_mode,
        size,
        mtime_ms
    )
}

fn generate_video_stream_thumbnail(
    path: &str,
    requested_width: Option<u32>,
    requested_height: Option<u32>,
    requested_time_us: Option<i64>,
    fit_mode: &str,
    cache_key: &str,
) -> Result<Option<ThumbnailResult>, String> {
    media_common::init_ffmpeg()?;
    let mut ictx = media_common::open_input(path)?;

    let Some(stream) = ictx.streams().best(ffmpeg::media::Type::Video) else {
        return Ok(None);
    };
    let stream_index = stream.index();
    let stream_params = stream.parameters().to_owned();

    if let Some(time_us) = requested_time_us {
        let clamped = time_us.max(0);
        if ictx.seek(clamped, stream_index as i64..).is_err() {
            let _ = ictx.seek(clamped, ..);
        }
    }

    let decoder_ctx = ffmpeg::codec::context::Context::from_parameters(stream_params)
        .map_err(|e| format!("Decoder context failed: {}", e))?;
    let mut decoder = decoder_ctx
        .decoder()
        .video()
        .map_err(|e| format!("Decoder failed: {}", e))?;

    if requested_time_us.is_some() {
        decoder.flush();
    }

    let mut scaler = if decoder.width() > 0 && decoder.height() > 0 {
        let src_width = decoder.width();
        let src_height = decoder.height();
        ffmpeg::software::scaling::context::Context::get(
            decoder.format(),
            src_width,
            src_height,
            ffmpeg::format::Pixel::RGB24,
            src_width,
            src_height,
            ffmpeg::software::scaling::flag::Flags::BILINEAR,
        )
        .ok()
    } else {
        None
    };

    for (stream, packet) in ictx.packets() {
        if stream.index() != stream_index {
            continue;
        }

        decoder
            .send_packet(&packet)
            .map_err(|e| format!("Send packet failed: {}", e))?;

        let mut decoded = ffmpeg::frame::Video::empty();
        if decoder.receive_frame(&mut decoded).is_ok() {
            let mut rgb_frame = ffmpeg::frame::Video::empty();
            if let Some(scaler) = &mut scaler {
                scaler
                    .run(&decoded, &mut rgb_frame)
                    .map_err(|e| format!("Scaling failed: {}", e))?;
            } else {
                return Ok(None);
            }

            let img_buffer = media_common::frame_to_rgb_image(&rgb_frame)?;
            return build_thumbnail_result(
                img_buffer,
                requested_width,
                requested_height,
                fit_mode,
                cache_key,
            )
            .map(Some);
        }
    }

    Ok(None)
}

fn generate_image_thumbnail(
    path: &str,
    requested_width: Option<u32>,
    requested_height: Option<u32>,
    fit_mode: &str,
    cache_key: &str,
) -> Result<ThumbnailResult, String> {
    let img_buffer = image::open(path)
        .map_err(|e| format!("Image decode failed: {}", e))?
        .to_rgb8();
    build_thumbnail_result(
        img_buffer,
        requested_width,
        requested_height,
        fit_mode,
        cache_key,
    )
}

fn build_thumbnail_result(
    mut img_buffer: RgbImage,
    requested_width: Option<u32>,
    requested_height: Option<u32>,
    fit_mode: &str,
    cache_key: &str,
) -> Result<ThumbnailResult, String> {
    let src_width = img_buffer.width();
    let src_height = img_buffer.height();
    let (target_width, target_height) =
        resolve_target_size(src_width, src_height, requested_width, requested_height);
    let (target_width, target_height) = clamp_size_to_max_resolution(target_width, target_height);

    if target_width != src_width || target_height != src_height {
        img_buffer = apply_fit_mode(img_buffer, target_width, target_height, fit_mode);
    }

    let mut cursor = Cursor::new(Vec::new());
    img_buffer
        .write_to(&mut cursor, ImageFormat::Jpeg)
        .map_err(|e| format!("Image encode failed: {}", e))?;

    let thumbnail_path = write_thumbnail_cache_file(cache_key, cursor.get_ref())?;

    Ok(ThumbnailResult {
        thumbnail_path,
        data_url: None,
        width: img_buffer.width(),
        height: img_buffer.height(),
    })
}

fn thumbnail_cache_dir() -> PathBuf {
    let base = dirs::cache_dir().unwrap_or_else(std::env::temp_dir);
    base.join("figurex").join("thumbnails")
}

fn cache_file_path_for_key(cache_key: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    cache_key.hash(&mut hasher);
    let hash = hasher.finish();
    thumbnail_cache_dir().join(format!("thumb_{hash:016x}.jpg"))
}

fn write_thumbnail_cache_file(cache_key: &str, bytes: &[u8]) -> Result<String, String> {
    let file_path = cache_file_path_for_key(cache_key);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Create thumbnail cache dir failed: {}", e))?;
    }
    fs::write(&file_path, bytes)
        .map_err(|e| format!("Write thumbnail cache file failed: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

fn resolve_target_size(
    src_width: u32,
    src_height: u32,
    requested_width: Option<u32>,
    requested_height: Option<u32>,
) -> (u32, u32) {
    match (requested_width, requested_height) {
        (Some(w), Some(h)) => (w.max(1), h.max(1)),
        (Some(w), None) => {
            let h = ((src_height as f64 * w as f64) / src_width as f64).round() as u32;
            (w.max(1), h.max(1))
        }
        (None, Some(h)) => {
            let w = ((src_width as f64 * h as f64) / src_height as f64).round() as u32;
            (w.max(1), h.max(1))
        }
        (None, None) => (src_width.max(1), src_height.max(1)),
    }
}

fn clamp_size_to_max_resolution(width: u32, height: u32) -> (u32, u32) {
    let width = width.max(1);
    let height = height.max(1);

    if width <= THUMBNAIL_MAX_WIDTH && height <= THUMBNAIL_MAX_HEIGHT {
        return (width, height);
    }

    let ratio_w = THUMBNAIL_MAX_WIDTH as f64 / width as f64;
    let ratio_h = THUMBNAIL_MAX_HEIGHT as f64 / height as f64;
    let ratio = ratio_w.min(ratio_h);

    let new_w = ((width as f64 * ratio).round() as u32).max(1);
    let new_h = ((height as f64 * ratio).round() as u32).max(1);
    (new_w, new_h)
}

fn apply_fit_mode(
    img: RgbImage,
    target_width: u32,
    target_height: u32,
    fit_mode: &str,
) -> RgbImage {
    if fit_mode == "cover" {
        return resize_and_cover(img, target_width, target_height);
    }
    resize(&img, target_width, target_height, FilterType::Lanczos3)
}

fn resize_and_cover(img: RgbImage, target_width: u32, target_height: u32) -> RgbImage {
    let src_w = img.width() as f64;
    let src_h = img.height() as f64;
    let target_w = target_width as f64;
    let target_h = target_height as f64;

    let scale = (target_w / src_w).max(target_h / src_h);
    let scaled_w = (src_w * scale).round().max(1.0) as u32;
    let scaled_h = (src_h * scale).round().max(1.0) as u32;

    let resized = resize(&img, scaled_w, scaled_h, FilterType::Lanczos3);
    let crop_x = ((scaled_w.saturating_sub(target_width)) / 2).min(scaled_w.saturating_sub(1));
    let crop_y = ((scaled_h.saturating_sub(target_height)) / 2).min(scaled_h.saturating_sub(1));
    crop_imm(
        &resized,
        crop_x,
        crop_y,
        target_width.min(scaled_w),
        target_height.min(scaled_h),
    )
    .to_image()
}
