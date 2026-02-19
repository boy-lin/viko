import { User } from "@/types/user";

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

const baseApiUrl = (import.meta.env.VITE_BASE_API_URL || "").replace(/\/$/, "");

export async function getUserInfoApi(): Promise<User> {
  if (!baseApiUrl) {
    throw new Error("VITE_BASE_API_URL is not configured");
  }

  const response = await fetch(`${baseApiUrl}/api/user/get-user-info`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user info");
  }

  const data = (await response.json()) as ApiResponse<User>;
  if (data.code !== 0 || !data.data) {
    throw new Error(data.message || "Failed to fetch user info");
  }

  return data.data;
}
