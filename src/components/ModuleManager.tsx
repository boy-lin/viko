import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { type as osType } from "@tauri-apps/api/os";
import {
  RefreshCw,
  Trash2,
  Folder,
  ArrowLeft,
  CheckCircle2,
  Download,
  Star,
} from "lucide-react";

type ModuleInfo = {
  id: string;
  name: string;
  ffmpeg_path: string;
  ffprobe_path: string;
  ffmpeg_version?: string | null;
  ffprobe_version?: string | null;
  source: string;
  is_active: boolean;
};

interface Props {
  onBack?: () => void;
}

const ModuleManager: React.FC<Props> = ({ onBack }) => {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [formName, setFormName] = useState("custom");
  const [ffmpegUrl, setFfmpegUrl] = useState("");
  const [ffprobeUrl, setFfprobeUrl] = useState("");
  const [platformDefaults, setPlatformDefaults] = useState<{
    ffmpeg: string;
    ffprobe: string;
  } | null>(null);

  const fetchModules = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await invoke<ModuleInfo[]>("list_modules");
      setModules(res);
    } catch (err: any) {
      setError(err?.message || "加载模块列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
    osType()
      .then((t) => {
        if (t === "Darwin") {
          setPlatformDefaults({
            ffmpeg: "https://evermeet.cx/ffmpeg/ffmpeg-6.1.1.zip",
            ffprobe: "https://evermeet.cx/ffmpeg/ffprobe-6.1.1.zip",
          });
        } else if (t === "Windows_NT") {
          setPlatformDefaults({
            ffmpeg:
              "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
            ffprobe:
              "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
          });
        } else {
          setPlatformDefaults({
            ffmpeg:
              "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
            ffprobe:
              "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz",
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleDelete = async (name: string) => {
    setDeleting(name);
    setError("");
    try {
      const res = await invoke<ModuleInfo[]>("delete_module", { name });
      setModules(res);
    } catch (err: any) {
      setError(err?.message || "删除模块失败");
    } finally {
      setDeleting(null);
    }
  };

  const handleActivate = async (m: ModuleInfo) => {
    setActivating(m.id);
    setError("");
    try {
      await invoke("set_active_module", {
        ffmpeg_path: m.ffmpeg_path,
        ffprobe_path: m.ffprobe_path,
      });
      await fetchModules();
    } catch (err: any) {
      setError(err?.message || "设置默认模块失败");
    } finally {
      setActivating(null);
    }
  };

  const handleDownloadDefault = async () => {
    setDownloading(true);
    setError("");
    try {
      await invoke("download_ffmpeg_ffprobe");
      await fetchModules();
    } catch (err: any) {
      setError(err?.message || "下载默认模块失败");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadCustom = async () => {
    setDownloading(true);
    setError("");
    try {
      await invoke("download_custom_module", {
        name: formName,
        ffmpeg_url: ffmpegUrl,
        ffprobe_url: ffprobeUrl,
      });
      await fetchModules();
    } catch (err: any) {
      setError(err?.message || "下载自定义模块失败");
    } finally {
      setDownloading(false);
    }
  };

  const activeName = useMemo(
    () => modules.find((m) => m.is_active)?.name,
    [modules]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-sm hover:bg-white/5 transition"
              >
                <ArrowLeft className="h-4 w-4" />
                返回
              </button>
            )}
            <div>
              <div className="text-xl font-semibold">模块管理</div>
              <div className="text-sm text-white/70">
                管理已下载的资源文件，支持清理删除
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeName && (
              <span className="text-sm text-emerald-200">
                当前默认：{activeName}
              </span>
            )}
            <button
              onClick={fetchModules}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-sm hover:bg-white/5 transition"
            >
              <RefreshCw className="h-4 w-4" />
              {loading ? "刷新中..." : "刷新"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-50">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-1 rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">下载模块</div>
              <button
                onClick={handleDownloadDefault}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {downloading ? "下载中..." : "下载默认"}
              </button>
            </div>
            <div className="text-sm text-white/70">
              自定义下载地址，保存到本地模块列表
            </div>
            <div className="space-y-2">
              <input
                className="w-full rounded-lg bg-white/10 border border-white/15 px-3 py-2 text-sm outline-none focus:border-white/40"
                placeholder="模块名称（建议字母或数字）"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
              <input
                className="w-full rounded-lg bg-white/10 border border-white/15 px-3 py-2 text-sm outline-none focus:border-white/40"
                placeholder="FFmpeg 下载地址"
                value={ffmpegUrl}
                onChange={(e) => setFfmpegUrl(e.target.value)}
              />
              <input
                className="w-full rounded-lg bg-white/10 border border-white/15 px-3 py-2 text-sm outline-none focus:border-white/40"
                placeholder="FFprobe 下载地址"
                value={ffprobeUrl}
                onChange={(e) => setFfprobeUrl(e.target.value)}
              />
              <div className="flex items-center gap-2">
                {platformDefaults && (
                  <button
                    onClick={() => {
                      setFfmpegUrl(platformDefaults.ffmpeg);
                      setFfprobeUrl(platformDefaults.ffprobe);
                    }}
                    className="text-xs px-3 py-2 rounded-lg border border-white/15 hover:bg-white/10 transition"
                  >
                    填入推荐下载地址
                  </button>
                )}
                <button
                  onClick={handleDownloadCustom}
                  disabled={downloading}
                  className="ml-auto inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-50 hover:bg-emerald-500/20 transition disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  {downloading ? "下载中..." : "下载并保存"}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-base font-semibold">模块列表</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {modules.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-full border border-blue-400/30 bg-blue-400/10 flex items-center justify-center">
                      <Folder className="h-5 w-5 text-blue-200" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-base font-semibold">{m.name}</div>
                        {m.is_active && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-100">
                            <Star className="h-3 w-3" />
                            默认
                          </span>
                        )}
                        {m.source === "system" && (
                          <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70">
                            系统
                          </span>
                        )}
                        {m.source === "bundle" && (
                          <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70">
                            内置
                          </span>
                        )}
                        {m.source === "custom" && (
                          <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70">
                            自定义
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-white/60 break-all">
                        FFmpeg: {m.ffmpeg_path}
                      </div>
                      <div className="text-xs text-white/60 break-all">
                        FFprobe: {m.ffprobe_path}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-white/80">
                    版本：{m.ffmpeg_version || "-"} ｜ {m.ffprobe_version || "-"}
                  </div>
                  <div className="flex gap-2">
                    {!m.is_active && (
                      <button
                        onClick={() => handleActivate(m)}
                        disabled={!!activating}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-50 hover:bg-emerald-500/20 transition disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {activating === m.id ? "切换中..." : "设为默认"}
                      </button>
                    )}
                    {m.source === "custom" && (
                      <button
                        onClick={() => handleDelete(m.id)}
                        disabled={!!deleting}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-50 hover:bg-red-500/20 transition disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deleting === m.id ? "删除中..." : "删除"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!loading && modules.length === 0 && (
                <div className="col-span-full text-center text-white/70 py-10 border border-dashed border-white/15 rounded-xl">
                  暂无已下载的模块
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleManager;
