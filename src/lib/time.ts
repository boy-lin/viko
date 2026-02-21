export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${hours}:${minutes}:${remainingSeconds}`;
}

const normalizeUnixTimestampToMillis = (timestamp: number): number => {
  // < 1e11 is treated as seconds-level unix timestamp, otherwise milliseconds.
  return timestamp < 1e11 ? timestamp * 1000 : timestamp;
};

export function getDurationSecondsFromTimestamps(
  createdAt?: number | null,
  finishedAt?: number | null
): number {
  if (typeof createdAt !== "number" || typeof finishedAt !== "number") {
    return 0;
  }
  if (!Number.isFinite(createdAt) || !Number.isFinite(finishedAt)) {
    return 0;
  }

  const createdAtMs = normalizeUnixTimestampToMillis(createdAt);
  const finishedAtMs = normalizeUnixTimestampToMillis(finishedAt);
  const diffMs = finishedAtMs - createdAtMs;

  if (diffMs <= 0) {
    return 0;
  }

  return diffMs / 1000;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
