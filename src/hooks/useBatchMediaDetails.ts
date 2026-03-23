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
  thumbnailPath?: string;
  args?: {
    input_path?: string;
  };
};

interface UseBatchMediaDetailsParams<TTask extends TaskLike> {
  tasks: TTask[];
  updateTaskById: (taskId: string, patch: any) => void;
  buildUpdate: (task: TTask, details: MediaDetailsWithResolve) => Partial<TTask>;
  errorMessage?: string;
}

export function useBatchMediaDetails<TTask extends TaskLike>({
  tasks,
  updateTaskById,
  buildUpdate,
  errorMessage = "Failed to load media details",
}: UseBatchMediaDetailsParams<TTask>) {
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
      .getMediaTaskCardBatch(paths, {
        width: 160,
        height: 90,
        fitMode: "cover",
      })
      .then((cards) => {
        if (unmountedRef.current) return;
        const byPath = new Map(cards.map((card) => [card.details.path, card]));
        pending.forEach((task) => {
          const card = byPath.get(task.args!.input_path!);
          if (!card) return;
          updateTaskById(task.id, {
            ...buildUpdate(task, card.details),
            thumbnailPath: card.thumbnailPath,
          });
        });

        setMetaStateById((prev) => {
          const next = { ...prev };
          pending.forEach((task) => {
            const card = byPath.get(task.args!.input_path!);
            if (!card) {
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
  }, [errorMessage, tasks, metaStateById, updateTaskById, buildUpdate]);

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
