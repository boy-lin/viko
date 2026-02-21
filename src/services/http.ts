const DEFAULT_TIMEOUT_MS = 15000;

export function buildTimeoutSignal(timeoutMs: number = DEFAULT_TIMEOUT_MS): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cancel: () => window.clearTimeout(timeoutId),
  };
}

export function getDefaultTimeoutMs() {
  return DEFAULT_TIMEOUT_MS;
}
