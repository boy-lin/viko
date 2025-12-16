import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, ArrowLeft } from "lucide-react";
import ModuleCard from "./ModuleCard";
import {
  isDev,
  FFMPEG_RESOURCES,
  FFMPEG_RESOURCES_DEV,
  PlatformKey,
  ModuleInfo,
} from "@/constants/ffmpeg";
import { detectPlatform } from "@/lib/platform";
import { Button } from "@/components/ui/button";

interface Props {}

const ModuleManagerList: React.FC<Props> = ({}) => {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resourceList, setResourceList] = useState<
    {
      ffmpeg: string;
      ffprobe: string;
      version: string;
    }[]
  >([]);

  const modulesMap = useMemo<Record<string, ModuleInfo>>(() => {
    return modules.reduce((acc, m) => {
      acc[m.id] = m;
      return acc;
    }, {} as Record<string, ModuleInfo>);
  }, [modules]);

  const fetchModules = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await invoke<ModuleInfo[]>("list_modules");
      console.log("list_modules:" + JSON.stringify(res));
      setModules(res);
    } catch (err: any) {
      setError(err?.message || "加载模块列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
    const platform: PlatformKey = detectPlatform();
    if (isDev) {
      setResourceList(FFMPEG_RESOURCES_DEV[platform]);
    } else {
      setResourceList(FFMPEG_RESOURCES[platform]);
    }
  }, []);

  const activeName = useMemo(
    () => modules.find((m) => m.is_active)?.name,
    [modules]
  );

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
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
                激活版本：{activeName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchModules}
              className="inline-flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              {loading ? "刷新中..." : "刷新"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-50">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-base font-semibold">模块列表</div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {resourceList.map((item) => {
              const isDownloaded = modulesMap[item.version] !== undefined;
              const isActive = modulesMap[item.version]?.is_active;
              return (
                <ModuleCard
                  key={item.version}
                  item={item}
                  isDownloaded={isDownloaded}
                  isActive={isActive}
                  refreshListCallback={fetchModules}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleManagerList;
