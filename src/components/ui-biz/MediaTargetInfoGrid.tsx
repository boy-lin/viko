import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { isAudioFormat, isImageFormat, isVideoFormat } from "@/data/formats";

interface MediaTargetInfoGridProps {
  args: ConvertVideoTaskArgs;
  className?: string;
}

function normalizeExt(extension?: string) {
  return (extension || "").toLowerCase();
}

export default function MediaTargetInfoGrid({
  args,
  className = "grid grid-cols-2 mt-1 text-sm text-muted-foreground",
}: MediaTargetInfoGridProps) {
  const format = normalizeExt(args.format);
  const firstAudioTrack = args.audio_tracks?.[0];

  let parts: Array<string | undefined> = [];
  if (isVideoFormat(format as any)) {
    parts = [
      args.format?.toUpperCase?.(),
      args.video_encoder?.toUpperCase?.(),
      args.resolution,
      args.video_bitrate ? String(args.video_bitrate) : undefined,
    ];
  } else if (isAudioFormat(format as any)) {
    parts = [
      args.format?.toUpperCase?.(),
      firstAudioTrack?.codec?.toUpperCase?.(),
      firstAudioTrack?.bitrate ? `${firstAudioTrack.bitrate}` : undefined,
      firstAudioTrack?.sample_rate ? `${firstAudioTrack.sample_rate}` : undefined,
    ];
  } else if (isImageFormat(format as any)) {
    parts = [
      args.format?.toUpperCase?.(),
      undefined,
      args.resolution,
      undefined,
    ];
  } else {
    parts = [args.format?.toUpperCase?.(), args.video_encoder?.toUpperCase?.()];
  }

  return (
    <div className={className}>
      {parts.map((p, idx) => (
        <span key={idx}>{p || "auto"}</span>
      ))}
    </div>
  );
}

