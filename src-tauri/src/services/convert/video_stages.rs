use crate::events::TaskEmitter;
use crate::media_common;
use crate::media_common::audio_transcode::AudioTrackProcessor;

use super::Transcoder;

pub(super) type ConvertProcessStageContext<'a, E> =
    media_common::video_pipeline::ConvertPacketStageContext<'a, Transcoder<E>, AudioTrackProcessor>;
pub(super) type ConvertDrainStageContext<'a, E> =
    media_common::video_pipeline::ConvertDrainStageContext<'a, Transcoder<E>, AudioTrackProcessor>;

pub(super) fn process_packets_stage<E: TaskEmitter>(
    ctx: &mut ConvertProcessStageContext<'_, E>,
) -> Result<(), String> {
    for (stream, mut packet) in ctx.ictx.packets() {
        if crate::task::cancel::is_cancelled() {
            return Err("Task cancelled".to_string());
        }
        let ist_index = stream.index();
        if ist_index >= ctx.stream_mapping.len() {
            continue;
        }
        let mapping = ctx.stream_mapping[ist_index] as isize;
        if mapping == -2 {
            if let Some(indices) = ctx.audio_map.get(&ist_index) {
                for (n, &proc_idx) in indices.iter().enumerate() {
                    let pkt_clone = if n == 0 { None } else { Some(packet.clone()) };
                    let pkt_ref = pkt_clone.as_ref().unwrap_or(&packet);
                    let proc = ctx
                        .audio_processors
                        .get_mut(proc_idx)
                        .ok_or("音频处理器索引无效")?;
                    let ost_index = proc.ost_index;
                    if ost_index >= ctx.ost_time_bases.len() {
                        return Err(format!("Invalid audio output stream index: {}", ost_index));
                    }
                    let ost_time_base = ctx.ost_time_bases[ost_index];
                    proc.process_packet(
                        pkt_ref,
                        ctx.ist_time_bases[ist_index],
                        ost_time_base,
                        ctx.octx,
                    )?;
                }
            }
            continue;
        }
        if mapping < 0 {
            continue;
        }

        let ost_idx = mapping as usize;
        let ost_time_base = ctx.ost_time_bases[ost_idx];

        if let Some(transcoder) = ctx.transcoders.get_mut(&ist_index) {
            if let Err(e) = transcoder.send_packet_to_decoder(&packet) {
                log::error!("Video decode send failed: {}", e);
                return Err(format!("Video decode send failed: {}", e));
            }
            if let Err(e) =
                transcoder.receive_and_process_decoded_frames(
                    ctx.octx,
                    ctx.ost_time_bases[mapping as usize],
                )
            {
                log::error!("Video process failed: {}", e);
                return Err(format!("Video process failed: {}", e));
            }
        } else {
            let packet_size = packet.size() as u64;
            packet.rescale_ts(ctx.ist_time_bases[ist_index], ost_time_base);
            packet.set_position(-1);
            packet.set_stream(ost_idx);
            packet
                .write_interleaved(ctx.octx)
                .map_err(|e| format!("Write packet failed: {}", e))?;
            *ctx.stream_copy_bytes = ctx.stream_copy_bytes.saturating_add(packet_size);
        }
    }
    Ok(())
}

pub(super) fn drain_processors_stage<E: TaskEmitter>(
    ctx: &mut ConvertDrainStageContext<'_, E>,
) -> Result<(), String> {
    for (ist_index, transcoder) in ctx.transcoders.iter_mut() {
        let ost_idx = ctx.stream_mapping[*ist_index] as usize;
        let ost_time_base = ctx.ost_time_bases[ost_idx];

        if let Err(e) = transcoder.send_eof_to_decoder() {
            log::error!("Video decode eof failed: {}", e);
            return Err(e);
        }
        if let Err(e) = transcoder.receive_and_process_decoded_frames(ctx.octx, ost_time_base) {
            log::error!("Video process failed (flush decode): {}", e);
            return Err(e);
        }
        if let Err(e) = transcoder.flush_filter_and_drain(ctx.octx, ost_time_base) {
            log::error!("Video filter flush failed: {}", e);
            return Err(e);
        }
        if let Err(e) = transcoder.send_eof_to_encoder() {
            log::error!("Video encode eof failed: {}", e);
            return Err(e);
        }
        if let Err(e) = transcoder.receive_and_process_encoded_packets(ctx.octx, ost_time_base) {
            log::error!("Video encode receive failed: {}", e);
            return Err(e);
        }
    }

    for proc in ctx.audio_processors.iter_mut() {
        let ost_index = proc.ost_index;
        if ost_index < ctx.ost_time_bases.len() {
            let ost_time_base = ctx.ost_time_bases[ost_index];
            proc.finish(ost_time_base, ctx.octx)?;
        }
    }

    Ok(())
}
