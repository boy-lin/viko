import React, { useEffect, useMemo, useState } from "react";
import { Trash2, CheckCircle, Download } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { bridge, type DownloadProgress } from "@/lib/bridge";

type ResourceItem = {
  version: string;
  ffmpeg: string;
  ffprobe: string;
};

interface Props {
  item: ResourceItem;
  isDownloaded: boolean;
  isActive?: boolean;
  refreshListCallback: () => void;
}

const ModuleCard: React.FC<Props> = ({
  item,
  isDownloaded,
  isActive,
  refreshListCallback,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState("");

  const percent = useMemo(() => {
    if (!progress?.total) return undefined;
    return Math.min(
      100,
      Math.round((progress.downloaded * 100) / (progress.total || 1))
    );
  }, [progress]);

  useEffect(() => {
    let off: (() => void) | undefined;
    bridge
      .on("ffmpeg-download-progress", (payload) => {
        if (!downloading) return;
        setProgress(payload as DownloadProgress);
      })
      .then((fn) => {
        off = fn;
      });
    return () => off?.();
  }, [downloading]);

  const handleDelete = async (version: string) => {
    const res = await invoke("delete_module", { version });
    console.log("delete_module:" + JSON.stringify(res));
    await refreshListCallback?.();
  };

  const handleDownload = (item: {
    ffmpeg: string;
    ffprobe: string;
    version: string;
  }) => {
    setDownloading(true);
    setError("");
    setProgress(null);

    const params = {
      version: item?.version,
      ffmpegUrl: item?.ffmpeg,
      ffprobeUrl: item?.ffprobe,
    };

    // 异步触发下载，避免在主线程上长时间等待
    invoke("download_custom_module", params)
      .then((res) => {
        console.log("download_custom_module:" + JSON.stringify(res));
        return refreshListCallback?.();
      })
      .catch((err: any) => {
        console.error("download_custom_module error:" + JSON.stringify(err));
        setError(err?.message || "下载失败，请重试");
      })
      .finally(() => {
        setDownloading(false);
      });
  };

  const handleActivate = async (version: string) => {
    const res = await invoke("set_active_module", { version });
    console.log("set_active_module:" + JSON.stringify(res));
    await refreshListCallback?.();
  };

  const renderOption = () => {
    if (error) {
      return (
        <div className="mt-1 text-red-300 flex items-center gap-2">
          <span>{error}</span>
          <button
            className="underline text-red-200 hover:text-red-100"
            onClick={() => handleDownload(item)}
          >
            重试
          </button>
        </div>
      );
    }
    if (isDownloaded) {
      if (isActive) {
        return (
          <button className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm">
            <CheckCircle className="text-emerald-400 h-4 w-4" />
            已激活
          </button>
        );
      }
      return (
        <>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
            onClick={() => handleActivate(item.version)}
          >
            设置为默认
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition disabled:opacity-60"
            onClick={() => handleDelete(item.version)}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        </>
      );
    }
    if (downloading) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span>{progress?.stage || "下载中"}</span>
            {percent !== undefined && <span>{percent}%</span>}
          </div>
          {percent !== undefined && (
            <div className="w-full bg-white/10 rounded h-2">
              <div
                className="h-2 rounded bg-emerald-400 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm"
        onClick={() => handleDownload(item)}
      >
        <Download className="h-4 w-4" />
        下载
      </button>
    );
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center justify-between gap-2">
      <div className="flex flex-col">
        <div className="text-sm font-semibold">{item.version}</div>
        {/* <div className="text-sm text-white/70">{item.ffmpeg}</div> */}
        {/* <div className="text-sm text-white/70">{item.ffprobe}</div> */}
      </div>
      <div className="flex items-center gap-2">{renderOption()}</div>
    </div>
  );
};

export default ModuleCard;
