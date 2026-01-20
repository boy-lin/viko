use ffmpeg_next as ffmpeg;
use ffmpeg::{format, frame};
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
        match (frame.format(), frame.is_packed()) {
            (format::Sample::F32(_), true) => {
                let data: &[f32] = frame.plane(0);
                self.producer.push_slice(data);
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
                let data: &[i16] = frame.plane(0);
                for &s in data {
                    let _ = self.producer.push(s as f32 / i16::MAX as f32);
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
                let data: &[i32] = frame.plane(0);
                for &s in data {
                    let _ = self.producer.push(s as f32 / i32::MAX as f32);
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
        match (self.target_format, frame.is_packed()) {
            (format::Sample::F32(_), true) => {
                frame.plane_mut(0).copy_from_slice(data);
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
                let dest: &mut [i16] = frame.plane_mut(0);
                for (d, s) in dest.iter_mut().zip(data.iter().copied()) {
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
                let dest: &mut [i32] = frame.plane_mut(0);
                for (d, s) in dest.iter_mut().zip(data.iter().copied()) {
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
