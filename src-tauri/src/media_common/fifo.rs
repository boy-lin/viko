use ffmpeg::{format, frame};
use ffmpeg_next as ffmpeg;
use ringbuf::{Consumer, HeapRb, Producer};
use std::sync::Arc;

/// Audio FIFO buffer for handling variable-sized resampled frames
/// and producing fixed-size frames for encoders (e.g., MP3 requires 1152 samples per frame)
pub struct AudioFifo {
    producer: Producer<f32, Arc<HeapRb<f32>>>,
    consumer: Consumer<f32, Arc<HeapRb<f32>>>,
    target_layout: ffmpeg::ChannelLayout,
    target_format: format::Sample,
    target_rate: u32,
}

impl AudioFifo {
    fn is_packed_format(sample: format::Sample) -> bool {
        matches!(
            sample,
            format::Sample::F32(format::sample::Type::Packed)
                | format::Sample::I16(format::sample::Type::Packed)
                | format::Sample::I32(format::sample::Type::Packed)
        )
    }

    /// Create a new AudioFifo with the specified parameters
    pub fn new(
        target_format: format::Sample,
        target_layout: ffmpeg::ChannelLayout,
        target_rate: u32,
    ) -> Self {
        let buffer_capacity = (target_rate as usize) * 5 * target_layout.channels() as usize;
        let buffer = HeapRb::<f32>::new(buffer_capacity);
        let (producer, consumer) = buffer.split();

        Self {
            producer,
            consumer,
            target_layout,
            target_format,
            target_rate,
        }
    }

    /// Push a resampled audio frame into the FIFO buffer
    pub fn push_frame(&mut self, frame: &frame::Audio) {
        let channels = self.target_layout.channels() as usize;
        let sample_format = frame.format();
        // For packed audio, use data(0) bytes to get interleaved samples across channels.
        let packed = Self::is_packed_format(sample_format) || frame.is_packed();
        match (sample_format, packed) {
            (format::Sample::F32(_), true) => {
                let bytes = frame.data(0);
                let sample_count = bytes.len() / std::mem::size_of::<f32>();
                let expected = frame.samples() * channels;
                // data(0) can include padding; only keep samples*channels.
                let count = sample_count.min(expected);
                if sample_count > 0 {
                    let data = unsafe {
                        std::slice::from_raw_parts(bytes.as_ptr() as *const f32, sample_count)
                    };
                    self.producer.push_slice(&data[..count]);
                }
            }
            (format::Sample::F32(_), false) => {
                for i in 0..frame.samples() {
                    for ch in 0..channels {
                        let val: f32 = frame.plane::<f32>(ch)[i];
                        let _ = self.producer.push(val);
                    }
                }
            }
            (format::Sample::I16(_), true) => {
                let bytes = frame.data(0);
                let sample_count = bytes.len() / std::mem::size_of::<i16>();
                let expected = frame.samples() * channels;
                let count = sample_count.min(expected);
                if sample_count > 0 {
                    let data = unsafe {
                        std::slice::from_raw_parts(bytes.as_ptr() as *const i16, sample_count)
                    };
                    for &s in &data[..count] {
                        let _ = self.producer.push(s as f32 / i16::MAX as f32);
                    }
                }
            }
            (format::Sample::I16(_), false) => {
                for i in 0..frame.samples() {
                    for ch in 0..channels {
                        let val: i16 = frame.plane::<i16>(ch)[i];
                        let _ = self.producer.push(val as f32 / i16::MAX as f32);
                    }
                }
            }
            (format::Sample::I32(_), true) => {
                let bytes = frame.data(0);
                let sample_count = bytes.len() / std::mem::size_of::<i32>();
                let expected = frame.samples() * channels;
                let count = sample_count.min(expected);
                if sample_count > 0 {
                    let data = unsafe {
                        std::slice::from_raw_parts(bytes.as_ptr() as *const i32, sample_count)
                    };
                    for &s in &data[..count] {
                        let _ = self.producer.push(s as f32 / i32::MAX as f32);
                    }
                }
            }
            (format::Sample::I32(_), false) => {
                for i in 0..frame.samples() {
                    for ch in 0..channels {
                        let val: i32 = frame.plane::<i32>(ch)[i];
                        let _ = self.producer.push(val as f32 / i32::MAX as f32);
                    }
                }
            }
            _ => {
                // Fallback: treat as f32-packed bytes if unknown; prevents panic.
                if frame.is_packed() {
                    let data: &[f32] = frame.plane(0);
                    self.producer.push_slice(data);
                }
            }
        }
    }

    /// Check if there are enough samples for a frame of the specified size
    pub fn has_samples(&self, frame_size: usize) -> bool {
        let samples_needed = frame_size * self.target_layout.channels() as usize;
        self.consumer.len() >= samples_needed
    }

    /// Get the number of available samples in the buffer
    pub fn available_samples(&self) -> usize {
        self.consumer.len() / self.target_layout.channels() as usize
    }

    /// Pop samples from the FIFO and fill an audio frame
    /// Returns true if successful, false if not enough samples
    pub fn pop_into_frame(&mut self, frame: &mut frame::Audio, frame_samples: usize) -> bool {
        let total_samples = frame_samples * self.target_layout.channels() as usize;

        if self.consumer.len() < total_samples {
            return false;
        }

        let mut frame_data = vec![0.0f32; total_samples];
        self.consumer.pop_slice(&mut frame_data);

        self.fill_frame(frame, &frame_data, frame_samples);
        true
    }

    /// Fill an audio frame with the provided data
    pub fn fill_frame(&self, frame: &mut frame::Audio, data: &[f32], frame_samples: usize) {
        let packed = Self::is_packed_format(self.target_format) || frame.is_packed();
        match (self.target_format, packed) {
            (format::Sample::F32(_), true) => {
                let bytes = frame.data_mut(0);
                let sample_count = bytes.len() / std::mem::size_of::<f32>();
                let total = frame_samples * self.target_layout.channels() as usize;
                let count = total.min(sample_count);
                let dest = unsafe {
                    std::slice::from_raw_parts_mut(bytes.as_mut_ptr() as *mut f32, sample_count)
                };
                dest[..count].copy_from_slice(&data[..count]);
            }
            (format::Sample::F32(_), false) => {
                let channels = self.target_layout.channels() as usize;
                for i in 0..frame_samples {
                    for ch in 0..channels {
                        frame.plane_mut::<f32>(ch)[i] = data[i * channels + ch];
                    }
                }
            }
            (format::Sample::I16(_), true) => {
                let bytes = frame.data_mut(0);
                let sample_count = bytes.len() / std::mem::size_of::<i16>();
                let total = frame_samples * self.target_layout.channels() as usize;
                let count = total.min(sample_count);
                let dest = unsafe {
                    std::slice::from_raw_parts_mut(bytes.as_mut_ptr() as *mut i16, sample_count)
                };
                for (d, s) in dest[..count].iter_mut().zip(data.iter().copied()) {
                    *d = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                }
            }
            (format::Sample::I16(_), false) => {
                let channels = self.target_layout.channels() as usize;
                for i in 0..frame_samples {
                    for ch in 0..channels {
                        frame.plane_mut::<i16>(ch)[i] =
                            (data[i * channels + ch].clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                    }
                }
            }
            (format::Sample::I32(_), true) => {
                let bytes = frame.data_mut(0);
                let sample_count = bytes.len() / std::mem::size_of::<i32>();
                let total = frame_samples * self.target_layout.channels() as usize;
                let count = total.min(sample_count);
                let dest = unsafe {
                    std::slice::from_raw_parts_mut(bytes.as_mut_ptr() as *mut i32, sample_count)
                };
                for (d, s) in dest[..count].iter_mut().zip(data.iter().copied()) {
                    *d = (s.clamp(-1.0, 1.0) * i32::MAX as f32) as i32;
                }
            }
            (format::Sample::I32(_), false) => {
                let channels = self.target_layout.channels() as usize;
                for i in 0..frame_samples {
                    for ch in 0..channels {
                        frame.plane_mut::<i32>(ch)[i] =
                            (data[i * channels + ch].clamp(-1.0, 1.0) * i32::MAX as f32) as i32;
                    }
                }
            }
            _ => {}
        }
    }

    /// Get remaining samples (useful for flushing at the end)
    pub fn drain_remaining(&mut self) -> Vec<f32> {
        let remaining = self.consumer.len();
        let mut data = vec![0.0f32; remaining];
        self.consumer.pop_slice(&mut data);
        data
    }

    pub fn target_format(&self) -> format::Sample {
        self.target_format
    }

    pub fn target_layout(&self) -> ffmpeg::ChannelLayout {
        self.target_layout
    }

    pub fn target_rate(&self) -> u32 {
        self.target_rate
    }
}
