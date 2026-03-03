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
  className = "grid grid-cols-2 mt-2 text-sm text-muted-foreground",
}: MediaOriginalInfoGridProps) {
  const extension = normalizeExt(mediaDetails?.extension);
  const videoStream = mediaDetails?.streams.find((s) => s.codec_type === "video");
  const audioStream = mediaDetails?.streams.find((s) => s.codec_type === "audio");

  let parts: Array<string | undefined> = [];
  if (isVideoFormat(extension as any)) {
    parts = [
      mediaDetails?.extension?.toUpperCase?.(),
      videoStream?.codec_name?.toUpperCase?.(),
      videoStream?.width && videoStream?.height
        ? `${videoStream.width}x${videoStream.height}`
        : undefined,
      videoStream?.bit_rate ? String(videoStream.bit_rate / 1000) : undefined,
    ];
  } else if (isAudioFormat(extension as any)) {
    parts = [
      mediaDetails?.extension?.toUpperCase?.(),
      audioStream?.codec_name?.toUpperCase?.(),
      audioStream?.bit_rate ? String(audioStream.bit_rate) : undefined,
      audioStream?.sample_rate ? `${audioStream.sample_rate}` : undefined,
    ];
  } else if (isImageFormat(extension as any)) {
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

