use crate::events::TaskEmitter;
use crate::media_common;

use super::{AudioProcessor, VideoProcessor};

pub(super) type CompressProcessStageContext<'a, E> =
    media_common::video_pipeline::CompressPacketStageContext<'a, VideoProcessor<E>, AudioProcessor>;
pub(super) type CompressDrainStageContext<'a, E> =
    media_common::video_pipeline::CompressDrainStageContext<'a, VideoProcessor<E>, AudioProcessor>;

pub(super) fn process_packets_stage<E: TaskEmitter>(
    ctx: &mut CompressProcessStageContext<'_, E>,
) -> Result<(), String> {
    for (stream, packet) in ctx.ictx.packets() {
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }
        if stream.index() == ctx.video_idx {
            ctx.video_proc.process_packet(&packet, ctx.octx)?;
        } else if let Some(audio) = ctx.audio_proc.as_mut() {
            if stream.index() == audio.stream_index {
                audio.process_packet(&packet, ctx.octx)?;
            }
        }
    }
    Ok(())
}

pub(super) fn drain_processors_stage<E: TaskEmitter>(
    ctx: &mut CompressDrainStageContext<'_, E>,
) -> Result<(), String> {
    ctx.video_proc.finish(ctx.octx)?;
    if let Some(audio) = ctx.audio_proc.as_mut() {
        audio.finish(ctx.octx)?;
    }
    Ok(())
}
