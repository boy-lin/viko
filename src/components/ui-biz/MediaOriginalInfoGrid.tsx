import { isAudioFormat, isImageFormat, isVideoFormat } from "@/data/formats";
import { MediaDetails } from "@/types/tasks";

interface MediaOriginalInfoGridProps {
  mediaDetails?: MediaDetails;
  className?: string;
}

function normalizeExt(extension?: string) {
  return (extension || "").toLowerCase();
}

export default function MediaOriginalInfoGrid({
  mediaDetails,
  className = "grid grid-cols-2 gap-x-2 gap-y-0 text-sm text-muted-foreground/80",
}: MediaOriginalInfoGridProps) {
  const extension = normalizeExt(mediaDetails?.extension);
  const videoStream = mediaDetails?.streams.find((s) => s.codec_type === "video");
  const audioStream = mediaDetails?.streams.find((s) => s.codec_type === "audio");

  let parts: Array<string | undefined> = [];
  if (isVideoFormat(extension)) {
    parts = [
      mediaDetails?.extension?.toUpperCase?.(),
      videoStream?.codec_name?.toUpperCase?.(),
      videoStream?.width && videoStream?.height
        ? `${videoStream.width}x${videoStream.height}`
        : undefined,
      videoStream?.bit_rate ? `${videoStream.bit_rate / 1000} kbps` : undefined,
    ];
  } else if (isAudioFormat(extension)) {
    parts = [
      mediaDetails?.extension?.toUpperCase?.(),
      audioStream?.codec_name?.toUpperCase?.(),
      audioStream?.bit_rate ? `${audioStream.bit_rate / 1000} kbps` : undefined,
      audioStream?.sample_rate ? `${audioStream.sample_rate} Hz` : undefined,
    ];
  } else if (isImageFormat(extension)) {
    parts = [
      mediaDetails?.extension?.toUpperCase?.(),
      mediaDetails?.format_names,
      videoStream?.width && videoStream?.height
        ? `${videoStream.width}x${videoStream.height}`
        : undefined,
      undefined,
    ];
  } else {
    parts = [mediaDetails?.extension?.toUpperCase?.(), mediaDetails?.format_names];
  }

  return (
    <div className={className}>
      {parts.map((p, idx) => (
        <span key={idx}>{p || "-"}</span>
      ))}
    </div>
  );
}

