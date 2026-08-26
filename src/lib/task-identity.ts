import { bridge } from "@/lib/bridge";

export type MediaTaskClientContext = {
  is_logged_in: boolean;
  user_id?: string;
  device_id?: string;
  identity_scope: "user" | "guest";
  identity_key: string;
  is_token_preview?: boolean;
};

let cachedDeviceId: string | null = null;

async function getCachedDeviceId(): Promise<string | undefined> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }
  try {
    cachedDeviceId = await bridge.getDeviceId();
    return cachedDeviceId;
  } catch {
    return undefined;
  }
}

export async function resolveMediaTaskClientContext(): Promise<MediaTaskClientContext> {
  const deviceId = await getCachedDeviceId();
  return {
    is_logged_in: false,
    device_id: deviceId,
    identity_scope: "guest",
    identity_key: deviceId ? `guest:${deviceId}` : "guest:anonymous",
    is_token_preview: false,
  };
}
