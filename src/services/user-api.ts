import { User } from "@/types/user";
import { buildTimeoutSignal } from "@/services/http";
import { getDesktopAccessToken } from "@/lib/desktop-auth";
import { baseApiUrl } from "@/lib/env";

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

export async function getUserInfoApi(): Promise<User> {
  if (!baseApiUrl) {
    throw new Error("VITE_BASE_API_URL is not configured");
  }

  const { signal, cancel } = buildTimeoutSignal();
  let response: Response;
  try {
    console.warn('getUserInfoApi' + baseApiUrl);
    const accessToken = getDesktopAccessToken();
    response = await fetch(`${baseApiUrl}/api/user/get-user-info`, {
      method: "POST",
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      signal,
    });
  } catch (error) {
    console.warn('getUserInfoApi error' + JSON.stringify(error));
    throw error;
  } finally {
    cancel();
  }
  if (!response.ok) {
    throw new Error("Failed to fetch user info");
  }
  const data = (await response.json()) as ApiResponse<User>;
  if (data.code !== 0 || !data.data) {
    throw new Error(data.message || "Failed to fetch user info");
  }

  return data.data;
}
