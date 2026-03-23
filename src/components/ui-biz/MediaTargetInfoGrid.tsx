import { ConvertAudioTaskArgs, ConvertImageTaskArgs, ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { isAudioFormat, isImageFormat, isVideoFormat } from "@/data/formats";
import { FormatEnum } from "@/types/options";

interface MediaTargetInfoGridProps {
  args: any;
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

  let parts: Array<string | undefined> = [];
  if (isVideoFormat(format as any)) {
    const videoArgs = args as ConvertVideoTaskArgs;
    parts = [
      format?.toUpperCase?.(),
      videoArgs.video_encoder?.toUpperCase?.(),
      videoArgs.resolution,
      videoArgs.video_bitrate ? String(videoArgs.video_bitrate) : undefined,
    ];
  } else if (isAudioFormat(format as any)) {
    const audioArgs = args as ConvertAudioTaskArgs;
    const firstAudioTrack = audioArgs.audio_tracks?.[0];

    parts = [
      format?.toUpperCase?.(),
      firstAudioTrack?.codec?.toUpperCase?.(),
      firstAudioTrack?.bitrate ? `${firstAudioTrack.bitrate}` : undefined,
      firstAudioTrack?.sample_rate ? `${firstAudioTrack.sample_rate}` : undefined,
    ];
  } else if (format === FormatEnum.GIF || format === FormatEnum.APNG) {

    const imageArgs = args as ConvertImageTaskArgs;
    console.log('imageArgs', imageArgs);

    parts = [
      format?.toUpperCase?.(),
      imageArgs.image_encoder?.toUpperCase?.(),
      `${imageArgs.width}x${imageArgs.height}`,
      imageArgs.frame_rate ? `${imageArgs.frame_rate}` : undefined,
    ];
  } else if (isImageFormat(format as any)) {
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
    <div className={className}>
      {parts.map((p, idx) => (
        <span key={idx}>{p || "auto"}</span>
      ))}
    </div>
  );
}

