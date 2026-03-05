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
    _channels: usize,
    consumer: &mut Consumer<f32, Arc<HeapRb<f32>>>,
    volume: f32,
) -> (u64, usize) {
    data.fill(0.0);
    let popped = consumer.pop_slice(data);
    if (volume - 1.0).abs() <= f32::EPSILON {
        return (popped as u64, popped);
    }
    for sample in data.iter_mut().take(popped) {
        *sample = (*sample * volume).clamp(-1.0, 1.0);
    }
    ((popped as u64), popped)
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
    queued_samples.fetch_sub(popped, Ordering::Relaxed);
}

fn maybe_reset_buffer(
    reset_buffer_flag: &Arc<AtomicBool>,
    consumer: &mut Consumer<f32, Arc<HeapRb<f32>>>,
    queued_samples: &Arc<AtomicUsize>,
) {
    if !reset_buffer_flag.swap(false, Ordering::Relaxed) {
        return;
    }
    while consumer.pop().is_some() {}
    queued_samples.store(0, Ordering::Relaxed);
}

pub fn render_output_f32(
    data: &mut [f32],
    channels: usize,
    consumer: &mut Consumer<f32, Arc<HeapRb<f32>>>,
    playing: &Arc<AtomicBool>,
    volume: &Arc<AtomicU32>,
    queued_samples: &Arc<AtomicUsize>,
    reset_buffer_flag: &Arc<AtomicBool>,
    played_samples: &Arc<AtomicU64>,
) {
    maybe_reset_buffer(reset_buffer_flag, consumer, queued_samples);
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
    played_samples: &Arc<AtomicU64>,
    scratch: &mut Vec<f32>,
) {
    maybe_reset_buffer(reset_buffer_flag, consumer, queued_samples);
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
    played_samples: &Arc<AtomicU64>,
    scratch: &mut Vec<f32>,
) {
    maybe_reset_buffer(reset_buffer_flag, consumer, queued_samples);
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
