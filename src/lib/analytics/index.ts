import { AnalyticsProvider } from "./types";
import { PostHogAnalyticsProvider } from "./posthog";
import { GoogleAnalyticsProvider } from "./google-analytics";
import { bridge } from "@/lib/bridge";
import pkg from "../../../package.json";

const DEVICE_ID_STORAGE_KEY = "analytics_device_id";

type AnalyticsContext = {
  device_id: string;
  app_version: string;
  platform: "desktop" | "web";
  runtime: "tauri" | "browser";
  os: string;
  is_packaged: boolean;
  user_id?: string;
};

const detectOs = () => {
  if (typeof navigator === "undefined") return "unknown";

  const userAgentData = (
    navigator as Navigator & {
      userAgentData?: { platform?: string };
    }
  ).userAgentData;
  const candidate =
    userAgentData?.platform || navigator.platform || navigator.userAgent || "";
  const normalized = candidate.toLowerCase();

  if (normalized.includes("mac")) return "macos";
  if (normalized.includes("win")) return "windows";
  if (normalized.includes("linux")) return "linux";
  if (normalized.includes("android")) return "android";
  if (
    normalized.includes("iphone") ||
    normalized.includes("ipad") ||
    normalized.includes("ios")
  ) {
    return "ios";
  }
  return "unknown";
};

const runtime = bridge.isTauri() ? "tauri" : "browser";
const platform = runtime === "tauri" ? "desktop" : "web";

const createFallbackDeviceId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

class AnalyticsService {
  private providers: AnalyticsProvider[] = [];
  private initialized = false;
  private appOpenTracked = false;
  private context: AnalyticsContext = {
    device_id: createFallbackDeviceId(),
    app_version: pkg.version,
    platform,
    runtime,
    os: detectOs(),
    is_packaged: runtime === "tauri" && !import.meta.env.DEV,
  };

  init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    this.providers = [
      new PostHogAnalyticsProvider(),
      new GoogleAnalyticsProvider(),
    ];

    this.providers.forEach((provider) => provider.init());
    this.bootstrapContext();
  }

  private bootstrapContext() {
    if (typeof window !== "undefined") {
      const cachedDeviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (cachedDeviceId) {
        this.context.device_id = cachedDeviceId;
      } else {
        window.localStorage.setItem(
          DEVICE_ID_STORAGE_KEY,
          this.context.device_id,
        );
      }
    }

    void bridge
      .getDeviceId()
      .then((deviceId) => {
        if (!deviceId) return;
        this.context.device_id = deviceId;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
        }
      })
      .catch(() => {
        // keep fallback ID
      })
      .finally(() => {
        this.trackAppOpenOnce();
      });
  }

  private trackAppOpenOnce() {
    if (this.appOpenTracked) {
      return;
    }
    this.appOpenTracked = true;

    this.track("desktop_app_open", {
      opened_at: Date.now(),
      entry: "main",
    });
  }

  private withContext(
    properties?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...this.context,
      ...properties,
    };
  }

  track(eventName: string, properties?: Record<string, unknown>) {
    const payload = this.withContext(properties);
    this.providers.forEach((provider) => provider.track(eventName, payload));
  }

  identify(userId: string, properties?: Record<string, unknown>) {
    this.context.user_id = userId;
    const payload = this.withContext(properties);
    this.providers.forEach((provider) => provider.identify(userId, payload));
  }

  reset() {
    delete this.context.user_id;
    this.providers.forEach((provider) => provider.reset());
  }
}

export const analytics = new AnalyticsService();
export * from "./use-analytics";
