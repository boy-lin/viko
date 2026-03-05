import React, { useEffect, useMemo, useState } from "react";
import { bridge, type SelfCheckResult } from "@/lib/bridge";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCircle,
  ExternalLink,
  RefreshCw,
  ShieldOff,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type DownloadProgress = {
  stage: string;
  downloaded: number;
  total?: number | null;
};

interface Props {
  onPassed: () => void;
}

const SelfCheck: React.FC<Props> = ({ onPassed }) => {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<SelfCheckResult | null>(null);
  const [error, setError] = useState("");
  const [installing] = useState(false);
  const [progress] = useState<DownloadProgress | null>(null);

  const fetchCheck = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await bridge.runSelfCheck();
      setResult(res);
      console.log(`self check result: ${JSON.stringify(res)}`);
      if (res.ffmpeg_installed && res.ffprobe_installed && res.fs_permission) {
        onPassed();
      }
    } catch (err: any) {
      setError(err?.message || "自检失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCheck();
  }, []);

  const openSettings = async () => {
    try {
      await openUrl(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders"
      );
    } catch (err) {
      setError("无法打开系统设置，请手动检查磁盘读写权限");
    }
  };

  const steps = useMemo(
    () => [
      {
        title: "文件读写权限",
        ok: result?.fs_permission,
        description: result?.fs_permission
          ? "下载目录读写正常"
          : result?.fs_error || "未获取文件读写权限，请前往系统设置授权",
        action: !result?.fs_permission
          ? {
              label: "打开设置",
              icon: <ExternalLink className="h-4 w-4" />,
              onClick: openSettings,
            }
          : undefined,
      },
    ],
    [result, installing, loading, progress]
  );

  return (
    <div className="w-full">
      <div className="px-8 py-6 border-b border-white/10 bg-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-400/15 border border-emerald-400/40 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <div className="text-lg font-semibold">启动前自检</div>
            <div className="text-sm text-white/70">
              修改配置后，点击刷新自检按钮，通过后会自动进入首页
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={fetchCheck}
          className="inline-flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          {loading ? "正在检查..." : "刷新自检"}
        </Button>
      </div>

      {error && (
        <div className="mx-8 mt-4 rounded-lg border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-50">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 px-8 py-6">
        {steps.map((step) => (
          <div
            key={step.title}
            className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-1 h-10 w-10 flex items-center justify-center rounded-full ${
                  step.ok
                    ? "bg-emerald-400/15 border border-emerald-400/40"
                    : "bg-amber-400/15 border border-amber-400/40"
                }`}
              >
                {step.ok ? (
                  <CheckCircle className="h-6 w-6 text-emerald-300" />
                ) : (
                  <ShieldOff className="h-6 w-6 text-amber-300" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold">{step.title}</div>
                  {step.ok ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-400/20 text-emerald-100">
                      已通过
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-400/20 text-amber-100">
                      待处�?
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-white/70 leading-relaxed">
                  {loading ? "检测中..." : step.description}
                </p>
                {step.action && (
                  <Button
                    variant="outline"
                    onClick={step.action.onClick}
                    disabled={
                      installing && step.title === "FFmpeg / FFprobe 环境"
                    }
                    className="mt-3 inline-flex items-center gap-2"
                  >
                    {step.action.icon}
                    {step.action.label}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SelfCheck;
