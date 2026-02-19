import { bridge, type TaskHistoryItem } from "@/lib/bridge";

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type TaskHistoryListData = {
  list: TaskHistoryItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

const baseApiUrl = (import.meta.env.VITE_BASE_API_URL || "").replace(/\/$/, "");

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!baseApiUrl) {
    throw new Error("VITE_BASE_API_URL is not configured");
  }

  const response = await fetch(`${baseApiUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || json.code !== 0) {
    throw new Error(json.message || `Request failed: ${path}`);
  }

  return json.data as T;
}

export async function getRemoteTaskHistory(params: {
  page: number;
  limit: number;
  keyword?: string;
  taskType?: string;
}) {
  return postJson<TaskHistoryListData>("/api/task/history/list", params);
}

export async function deleteRemoteTaskHistory(id: string): Promise<void> {
  await postJson<Record<string, never>>("/api/task/history/delete", { id });
}

export async function syncLocalTaskHistoryToRemote(limit = 200): Promise<void> {
  const localItems = await bridge.getTaskHistory(limit, 0, undefined, undefined);
  if (localItems.length === 0) {
    return;
  }

  await postJson<Record<string, never>>("/api/task/history/upsert", {
    tasks: localItems.map((item) => ({
      id: item.id,
      task_type: item.task_type,
      media_type: item.media_type,
      status: item.status,
      input_path: item.input_path,
      output_path: item.output_path,
      output_size: item.output_size,
      output_duration: item.output_duration,
      title: item.title,
      thumbnail: item.thumbnail,
      created_at: item.created_at,
      finished_at: item.finished_at,
      error_message: item.error_message,
    })),
  });
}
