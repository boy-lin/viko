import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "@/lib/bridge";
import { MediaDetailsWithResolve } from "@/types/tasks";

export type MediaMetaStatus = {
  status: "idle" | "loading" | "error";
  error?: string;
};

type TaskLike = {
  id: string;
  mediaDetails?: unknown;
  args?: {
    input_path?: string;
  };
};

interface UseBatchMediaDetailsParams<TTask extends TaskLike, TUpdate> {
  tasks: TTask[];
  updateTaskById: (taskId: string, patch: TUpdate) => void;
  buildUpdate: (task: TTask, details: MediaDetailsWithResolve) => TUpdate;
  errorMessage?: string;
}

export function useBatchMediaDetails<TTask extends TaskLike, TUpdate>({
  tasks,
  updateTaskById,
  buildUpdate,
  errorMessage = "Failed to load media details",
}: UseBatchMediaDetailsParams<TTask, TUpdate>) {
  const [metaStateById, setMetaStateById] = useState<
    Record<string, MediaMetaStatus>
  >({});
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    const pending = tasks.filter((task) => {
      if (task.mediaDetails || !task.args?.input_path) return false;
      return metaStateById[task.id]?.status !== "loading";
    });
    if (pending.length === 0) return;

    setMetaStateById((prev) => {
      const next = { ...prev };
      pending.forEach((task) => {
        next[task.id] = { status: "loading" };
      });
      return next;
    });

    const paths = pending.map((task) => task.args!.input_path!);
    void bridge
      .getMediaDetailsBatch(paths)
      .then((detailsList) => {
        if (unmountedRef.current) return;
        const byPath = new Map(
          detailsList.map((details) => [details.path, details]),
        );

        pending.forEach((task) => {
          const details = byPath.get(task.args!.input_path!);
          if (!details) return;
          updateTaskById(task.id, buildUpdate(task, details));
          console.log("details", details);
        });

        setMetaStateById((prev) => {
          const next = { ...prev };
          pending.forEach((task) => {
            const details = byPath.get(task.args!.input_path!);
            if (!details) {
              next[task.id] = {
                status: "error",
                error: errorMessage,
              };
              return;
            }
            next[task.id] = { status: "idle" };
          });
          return next;
        });
      })
      .catch((error) => {
        if (unmountedRef.current) return;
        const message = error instanceof Error ? error.message : errorMessage;
        setMetaStateById((prev) => {
          const next = { ...prev };
          pending.forEach((task) => {
            next[task.id] = { status: "error", error: message };
          });
          return next;
        });
      });
  }, [tasks]);

  const retryMeta = useCallback((taskId: string) => {
    setMetaStateById((prev) => ({
      ...prev,
      [taskId]: { status: "idle" },
    }));
  }, []);
  return {
    metaStateById,
    retryMeta,
  };
}
