import { AudioTrackConfig, ConvertAudioTaskArgs, ConvertImageTaskArgs, ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { isAudioFormat, isImageFormat, isVideoFormat } from "@/data/formats";
import { FormatEnum } from "@/types/options";
import { cn } from "@/lib/utils";

interface MediaTargetInfoGridProps {
  args: any;
  className?: string;
  unsupported?: boolean;
  unsupportedText?: string;
}

function normalizeExt(extension?: string) {
  return (extension || "").toLowerCase();
}

function audioTrackInfoLabel(track?: AudioTrackConfig) {
  if (!track) return '无音轨';
  return `${track.codec?.toUpperCase?.()} ${track.bitrate ? `${track.bitrate} kbps` : undefined}`;
}

export default function MediaTargetInfoGrid({
  args,
  className,
  unsupported,
  unsupportedText,
}: MediaTargetInfoGridProps) {
  if (unsupported) {
    return (
      <div className={cn(className, "text-sm font-medium text-destructive")}>
        {unsupportedText ?? "Unavailable"}
      </div>
    );
  }

  const format = normalizeExt(args.format);

  let parts: Array<string | undefined> = [];
  if (isVideoFormat(format as any)) {
    const videoArgs = args as ConvertVideoTaskArgs;
    parts = [
      format?.toUpperCase?.(),
      videoArgs.video_encoder?.toUpperCase?.(),
      videoArgs.resolution,
      audioTrackInfoLabel(videoArgs.audio_tracks?.[0]),
    ];
  } else if (isAudioFormat(format as any)) {
    const audioArgs = args as ConvertAudioTaskArgs;
    const firstAudioTrack = audioArgs.audio_tracks?.[0];

    parts = [
      format?.toUpperCase?.(),
      firstAudioTrack?.codec?.toUpperCase?.(),
      firstAudioTrack?.bitrate ? `${firstAudioTrack.bitrate} kbps` : undefined,
      `${firstAudioTrack?.sample_rate} Hz`
    ];
  } else if (format === FormatEnum.GIF || format === FormatEnum.APNG) {
    const imageArgs = args as ConvertImageTaskArgs;
    parts = [
      format?.toUpperCase?.(),
      imageArgs.image_encoder?.toUpperCase?.(),
      `${imageArgs.width}x${imageArgs.height}`,
      imageArgs.frame_rate ? `${imageArgs.frame_rate}` : undefined,
    ];
  } else if (isImageFormat(format)) {
    const imageArgs = args as ConvertImageTaskArgs;
    parts = [
      format?.toUpperCase?.(),
      imageArgs.image_encoder?.toUpperCase?.(),
      `${imageArgs.width}x${imageArgs.height}`,
      imageArgs.quality ? `${imageArgs.quality}` : undefined,
    ];
  } else {
    parts = [args.format?.toUpperCase?.(), args.video_encoder?.toUpperCase?.()];
  }

  return (
    <div className={cn(className, "grid grid-cols-2 gap-x-2 gap-y-0 text-sm text-muted-foreground")}>
      {parts.map((p, idx) => (
        <span key={idx} className="whitespace-nowrap">{p || "auto"}</span>
      ))}
    </div>
  );
}

