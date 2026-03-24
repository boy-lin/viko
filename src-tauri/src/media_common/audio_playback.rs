use ringbuf::{Consumer, HeapRb};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::Arc;

pub fn fill_silence_f32(data: &mut [f32]) {
    data.fill(0.0);
}

pub fn fill_silence_i16(data: &mut [i16]) {
    data.fill(0);
}

pub fn fill_silence_u16(data: &mut [u16]) {
    data.fill(u16::MAX / 2);
}

pub fn drain_to_output_f32(
    data: &mut [f32],
    channels: usize,
    consumer: &mut Consumer<f32, Arc<HeapRb<f32>>>,
    volume: f32,
) -> (u64, usize) {
    data.fill(0.0);
    let popped = consumer.pop_slice(data);
    if (volume - 1.0).abs() <= f32::EPSILON {
        let written_frames = (popped / channels) as u64;
        return (written_frames, popped);
    }
    for sample in data.iter_mut().take(popped) {
        *sample = (*sample * volume).clamp(-1.0, 1.0);
    }
    let written_frames = (popped / channels) as u64;
    (written_frames, popped)
}

pub fn drain_to_output_i16(
    data: &mut [i16],
    channels: usize,
    consumer: &mut Consumer<f32, Arc<HeapRb<f32>>>,
    volume: f32,
    scratch: &mut Vec<f32>,
) -> (u64, usize) {
    data.fill(0);
    if scratch.len() < data.len() {
        scratch.resize(data.len(), 0.0);
    }
    let popped_samples = consumer.pop_slice(&mut scratch[..data.len()]);
    for (dst, src) in data
        .iter_mut()
        .zip(scratch.iter().copied())
        .take(popped_samples)
    {
        *dst = (src * volume * i16::MAX as f32) as i16;
    }
    let written_frames = (popped_samples / channels) as u64;
    (written_frames, popped_samples)
}

pub fn drain_to_output_u16(
    data: &mut [u16],
    channels: usize,
    consumer: &mut Consumer<f32, Arc<HeapRb<f32>>>,
    volume: f32,
    scratch: &mut Vec<f32>,
) -> (u64, usize) {
    data.fill(u16::MAX / 2);
    if scratch.len() < data.len() {
        scratch.resize(data.len(), 0.0);
    }
    let popped_samples = consumer.pop_slice(&mut scratch[..data.len()]);
    for (dst, src) in data
        .iter_mut()
        .zip(scratch.iter().copied())
        .take(popped_samples)
    {
        let scaled = ((src * volume).clamp(-1.0, 1.0) + 1.0) * 0.5;
        *dst = (scaled * u16::MAX as f32) as u16;
    }
    let written_frames = (popped_samples / channels) as u64;
    (written_frames, popped_samples)
}

fn sub_samples(queued_samples: &Arc<AtomicUsize>, popped: usize) {
    if popped == 0 {
        return;
    }
    let _ = queued_samples.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
        Some(current.saturating_sub(popped))
    });
}

fn maybe_reset_buffer(
    reset_buffer_flag: &Arc<AtomicBool>,
    consumer: &mut Consumer<f32, Arc<HeapRb<f32>>>,
    queued_samples: &Arc<AtomicUsize>,
) -> usize {
    if !reset_buffer_flag.swap(false, Ordering::Relaxed) {
        return 0;
    }
    while consumer.pop().is_some() {}
    let drained = queued_samples.swap(0, Ordering::Relaxed);
    queued_samples.store(0, Ordering::Relaxed);
    log::info!(
        "[audio][playback] reset_buffer_flag consumed: drained_samples={}",
        drained
    );
    drained
}

fn consume_seek_discard_samples(
    consumer: &mut Consumer<f32, Arc<HeapRb<f32>>>,
    queued_samples: &Arc<AtomicUsize>,
    discard_output_samples: &Arc<AtomicUsize>,
) -> usize {
    let remain = discard_output_samples.load(Ordering::Relaxed);
    if remain == 0 {
        return 0;
    }

    let mut dropped = 0usize;
    for _ in 0..remain {
        if consumer.pop().is_some() {
            dropped += 1;
        } else {
            break;
        }
    }

    if dropped > 0 {
        sub_samples(queued_samples, dropped);
        log::debug!(
            "[audio][playback] seek discard consumed dropped_samples={} remaining={}",
            dropped,
            discard_output_samples
                .load(Ordering::Relaxed)
                .saturating_sub(dropped)
        );
    }
    let _ = discard_output_samples.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
        Some(current.saturating_sub(dropped))
    });
    dropped
}

pub fn render_output_f32(
    data: &mut [f32],
    channels: usize,
    consumer: &mut Consumer<f32, Arc<HeapRb<f32>>>,
    playing: &Arc<AtomicBool>,
    volume: &Arc<AtomicU32>,
    queued_samples: &Arc<AtomicUsize>,
    reset_buffer_flag: &Arc<AtomicBool>,
    discard_output_samples: &Arc<AtomicUsize>,
    played_samples: &Arc<AtomicU64>,
) {
    let _ = maybe_reset_buffer(reset_buffer_flag, consumer, queued_samples);
    let dropped = consume_seek_discard_samples(consumer, queued_samples, discard_output_samples);
    if dropped > 0 {
        fill_silence_f32(data);
        return;
    }
    if !playing.load(Ordering::Relaxed) {
        fill_silence_f32(data);
        return;
    }
    let vol = f32::from_bits(volume.load(Ordering::Relaxed));
    let (written_frames, popped_samples) = drain_to_output_f32(data, channels, consumer, vol);
    if popped_samples > 0 {
        sub_samples(queued_samples, popped_samples);
    }
    if written_frames > 0 {
        played_samples.fetch_add(written_frames, Ordering::Relaxed);
    }
}

pub fn render_output_i16(
    data: &mut [i16],
    channels: usize,
    consumer: &mut Consumer<f32, Arc<HeapRb<f32>>>,
    playing: &Arc<AtomicBool>,
    volume: &Arc<AtomicU32>,
    queued_samples: &Arc<AtomicUsize>,
    reset_buffer_flag: &Arc<AtomicBool>,
    discard_output_samples: &Arc<AtomicUsize>,
    played_samples: &Arc<AtomicU64>,
    scratch: &mut Vec<f32>,
) {
    let _ = maybe_reset_buffer(reset_buffer_flag, consumer, queued_samples);
    let dropped = consume_seek_discard_samples(consumer, queued_samples, discard_output_samples);
    if dropped > 0 {
        fill_silence_i16(data);
        return;
    }
    if !playing.load(Ordering::Relaxed) {
        fill_silence_i16(data);
        return;
    }
    let vol = f32::from_bits(volume.load(Ordering::Relaxed));
    let (written_frames, popped_samples) =
        drain_to_output_i16(data, channels, consumer, vol, scratch);
    if popped_samples > 0 {
        sub_samples(queued_samples, popped_samples);
    }
    if written_frames > 0 {
        played_samples.fetch_add(written_frames, Ordering::Relaxed);
    }
}

pub fn render_output_u16(
    data: &mut [u16],
    channels: usize,
    consumer: &mut Consumer<f32, Arc<HeapRb<f32>>>,
    playing: &Arc<AtomicBool>,
    volume: &Arc<AtomicU32>,
    queued_samples: &Arc<AtomicUsize>,
    reset_buffer_flag: &Arc<AtomicBool>,
    discard_output_samples: &Arc<AtomicUsize>,
    played_samples: &Arc<AtomicU64>,
    scratch: &mut Vec<f32>,
) {
    let _ = maybe_reset_buffer(reset_buffer_flag, consumer, queued_samples);
    let dropped = consume_seek_discard_samples(consumer, queued_samples, discard_output_samples);
    if dropped > 0 {
        fill_silence_u16(data);
        return;
    }
    if !playing.load(Ordering::Relaxed) {
        fill_silence_u16(data);
        return;
    }
    let vol = f32::from_bits(volume.load(Ordering::Relaxed));
    let (written_frames, popped_samples) =
        drain_to_output_u16(data, channels, consumer, vol, scratch);
    if popped_samples > 0 {
        sub_samples(queued_samples, popped_samples);
    }
    if written_frames > 0 {
        played_samples.fetch_add(written_frames, Ordering::Relaxed);
    }
}
