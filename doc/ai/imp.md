Media Modules Analysis and Refactoring Plan
Overview
Analysis of audio (
audio_converter.rs
, 
audio_compressor.rs
, 
audio.rs
) and video (
video_compressor.rs
, 
video_converter.rs
, 
video_player.rs
) modules reveals significant code duplication and opportunities for abstraction.

Audio Modules Analysis
Common Patterns & Duplication
1. FFmpeg Initialization & Duration Probing
Duplication: All modules call ffmpeg::init() separately.
Duration Logic: Nearly identical in get_audio_duration (converter) and 
probe_duration
 (player).
2. Codec & Format Selection
High Duplication: pick_sample_format, pick_channel_layout, pick_sample_rate repeated across converter and compressor.
Hardcoded Maps: String-to-codec mapping duplicated.
3. Critical Bug: Missing Audio FIFO
Problem: Both 
audio_converter.rs
 and 
audio_compressor.rs
 send arbitrary-sized resampled frames to encoders.
Impact: Causes libmp3lame "frame_size was not respected" errors.
Solution: Implement FIFO buffering (as shown in video_compressor.rs::AudioProcessor).
Video Modules Analysis
Common Patterns & Duplication
1. FFmpeg Initialization & Format Handling
Duplication: ffmpeg::init() called in all three modules.
Duration Calculation: Identical pattern ictx.duration() / AV_TIME_BASE.
2. Codec Selection & Hardware Acceleration
Duplication: Hardware codec selection logic (h264_videotoolbox vs libx264) duplicated between:
video_converter.rs::Transcoder::new (lines 202-227)
video_converter.rs::create_black_video_encoder (lines 609-634)
video_compressor.rs::VideoProcessor::new (lines 128-137)
Inconsistency: Compressor doesn't use hardware acceleration; converter does.
3. Encoder Configuration
Pattern: Similar setup for:
Resolution (
scaled_dimensions
 in compressor, 
parse_resolution
 in converter)
Bitrate calculation (
calc_video_bitrate
 in compressor, inline in converter)
Dictionary options (preset, profile, tune)
Duplication: Pixel format selection (
pick_pixel_format
 vs inline NV12/YUV420P checks)
4. Audio in Video Processing
Critical Finding: video_compressor.rs::AudioProcessor implements FIFO buffering correctly (lines 308-601).
Gap: This FIFO logic is NOT used in standalone audio converter/compressor modules, causing bugs.
Duplication: Audio codec selection logic similar to standalone audio modules.
5. Transcoding Loop Architecture
Shared Pattern:
Decode packet → frame
Scale/resample frame
Encode frame → packet
Write packet
Variations:
video_compressor.rs
: Struct-based (
VideoProcessor
, 
AudioProcessor
)
video_converter.rs
: Struct-based (
Transcoder
) + multi-track support
video_player.rs
: Uses video-rs (different abstraction layer)
6. Progress Reporting
Duplication: Similar progress calculation in:
VideoProcessor::emit_progress
Transcoder::receive_and_process_decoded_frames
Standalone audio modules
Inconsistency: Different event names ("compress" vs "convert"), different throttling logic.
Proposed Refactoring Architecture
Phase 1: Create media_common Module
media_common::init.rs
pub fn ensure_ffmpeg_init() -> Result<(), String>
pub fn get_media_duration(path: &str) -> Result<f64, String>
media_common::codec.rs
pub struct CodecSelector {
    pub fn select_video_encoder(
        name: &str, 
        use_hw: bool, 
        target_os: &str
    ) -> Result<Codec, String>
    
    pub fn select_audio_encoder(...) -> Result<Codec, String>
    
    pub fn pick_best_sample_format(...) -> Sample
    pub fn pick_best_sample_rate(...) -> u32
    pub fn pick_best_channel_layout(...) -> ChannelLayout
}
media_common::fifo.rs
pub struct AudioFifo {
    // Extract from video_compressor::AudioProcessor
    pub fn new(format: Sample, layout: ChannelLayout, ...) -> Self
    pub fn push_frame(&mut self, frame: &frame::Audio)
    pub fn pop_samples(&mut self, count: usize) -> Option<Vec<f32>>
}
media_common::progress.rs
pub fn emit_media_progress(
    window: &WebviewWindow,
    task_id: &str,
    operation: &str, // "compress"/"convert"
    media_type: &str, // "audio"/"video"
    progress: f64,
)
media_common::resolution.rs
pub fn parse_resolution(res: &str) -> Option<(u32, u32)>
pub fn scale_dimensions(src_w: u32, src_h: u32, ...) -> (u32, u32)
pub fn pick_pixel_format(bit_depth: Option<u32>, use_hw: bool) -> format::Pixel
Phase 2: Fix Critical Bugs
Audio FIFO Implementation
Extract FIFO from video_compressor::AudioProcessor (lines 309-601)
Apply to 
audio_converter.rs
:
Replace direct encoder.send_frame(&resampled) with FIFO buffering
Ensure encoder receives encoder.frame_size() samples per frame
Apply to 
audio_compressor.rs
:
Same FIFO pattern
Benefits: Eliminates MP3 encoding errors, improves codec compatibility
Phase 3: Refactor Video Modules
Hardware Acceleration Consolidation
Move hardware codec selection to media_common::codec
Apply to 
video_compressor.rs
 (currently missing)
Ensure consistent behavior across converter and compressor
Resolution & Scaling
Unify 
scaled_dimensions
 and 
parse_resolution
 into media_common::resolution
Share scaler setup logic
Multi-Track Audio
video_converter.rs
 has advanced multi-track support
Consider adding this capability to 
video_compressor.rs
Phase 4: Progress & Event Standardization
Use emit_media_progress everywhere
Standardize event naming
Unified throttling logic
Recommended Implementation Order
Critical Bug Fix (Immediate):

Implement 
AudioFifo
 in media_common::fifo.rs
Fix 
audio_converter.rs
 and 
audio_compressor.rs
Common Utilities (High Value):

Create media_common module
Move duration, codec selection, format picking
Video Refactoring (Medium Priority):

Consolidate hardware acceleration
Unify resolution/scaling logic
Advanced Features (Optional):

Add multi-track audio to compressor
Unified transcoding pipeline abstraction
Key Abstractions to Extract
Immediate (Critical Path)
✅ 
AudioFifo
 - Fixes production bugs
✅ CodecSelector::pick_best_* methods
✅ ensure_ffmpeg_init, get_media_duration
High Value (Reduces ~300 lines of duplication)
✅ Hardware codec selection
✅ Progress emitting
✅ Resolution parsing/scaling
Nice to Have
⚪ Unified transcoding loop abstraction
⚪ Multi-track audio support for compressor
Success Metrics
Bug Fixes: Eliminate MP3 encoding errors
Code Reduction: Remove ~300-400 lines of duplicated code
Consistency: Hardware acceleration works uniformly
Maintainability: Single source of truth for codec selection