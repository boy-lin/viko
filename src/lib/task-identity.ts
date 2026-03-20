import { bridge } from "@/lib/bridge";
import { getDesktopUserFromToken } from "@/lib/desktop-auth";
import { useUserStore } from "@/stores/user";

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
  const userState = useUserStore.getState();
  const tokenUser = getDesktopUserFromToken();
  const userId = userState.userInfo?.id || tokenUser?.id;

  if (userId) {
    return {
      is_logged_in: true,
      user_id: userId,
      identity_scope: "user",
      identity_key: `user:${userId}`,
      is_token_preview: userState.isTokenPreview || Boolean(tokenUser),
    };
  }

  const deviceId = await getCachedDeviceId();
  return {
    is_logged_in: false,
    device_id: deviceId,
    identity_scope: "guest",
    identity_key: deviceId ? `guest:${deviceId}` : "guest:anonymous",
    is_token_preview: false,
  };
}
