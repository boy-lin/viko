import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import CorrectNumberInput from "@/components/ui-lab/correct-number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { RESOLUTION_GROUPS_DEVICES, RESOLUTION_GROUPS_PLATFORMS } from "@/data/resolution";

interface VideoSimpleSettingsProps {
  resolution?: string;
  onResolutionChange?: (value: string) => void;
}

export const VideoSimpleSettings: React.FC<VideoSimpleSettingsProps> = ({
  resolution,
  onResolutionChange,
}) => {
  const [clarityMode, setClarityMode] = useState("bitrate");
  const [bitrate, setBitrate] = useState("auto");
  const [quality, setQuality] = useState("hd");
  const [ratioLocked, setRatioLocked] = useState(true);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [ratio, setRatio] = useState(1920 / 1080);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [platformDialogOpen, setPlatformDialogOpen] = useState(false);
  const [activeDeviceGroup, setActiveDeviceGroup] = useState(RESOLUTION_GROUPS_DEVICES[0]?.id || "");
  const [activePlatformGroup, setActivePlatformGroup] = useState(RESOLUTION_GROUPS_PLATFORMS[0]?.id || "");
  const resolutionOptions = [
    { value: "3840x2160", label: "3840×2160" },
    { value: "2560x1440", label: "2560×1440" },
    { value: "1920x1080", label: "1920×1080" },
    { value: "1280x720", label: "1280×720" },
    { value: "custom_16_9", label: "自定义(16:9)" },
  ];

  const normalizeResolution = (value: string) => value.replace("×", "x");
  const parseResolution = (value: string) => {
    const normalized = normalizeResolution(value);
    const [w, h] = normalized.split("x");
    if (!w || !h) return null;
    return { w, h };
  };

  const applyResolution = (value: string) => {
    onResolutionChange?.(value);
    if (value === "custom_16_9") {
      setRatioLocked(true);
      return;
    }
    const parsed = parseResolution(value);
    if (parsed) {
      setWidth(parsed.w);
      setHeight(parsed.h);
      if (parsed.h !== 0) setRatio(parsed.w / parsed.h);
    }
  };

  const handleWidthChange = (next: number) => {
    setWidth(next);
    if (ratioLocked && ratio) {
      setHeight(Math.max(1, Math.round(next / ratio)));
    }
  };

  const handleHeightChange = (next: number) => {
    setHeight(next);
    if (ratioLocked && ratio) {
      setWidth(Math.max(1, Math.round(next * ratio)));
    }
  };

  const activeDevice = useMemo(
    () => RESOLUTION_GROUPS_DEVICES.find((g) => g.id === activeDeviceGroup),
    [activeDeviceGroup]
  );
  const activePlatform = useMemo(
    () => RESOLUTION_GROUPS_PLATFORMS.find((g) => g.id === activePlatformGroup),
    [activePlatformGroup]
  );

  return (
    <div className="space-y-4 p-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">清晰度</span>
          <Select value={clarityMode} onValueChange={setClarityMode}>
            <SelectTrigger className="h-10 rounded-full bg-muted/30 border-muted-foreground/10">
              <SelectValue placeholder="按码率区分" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bitrate">按码率区分</SelectItem>
              <SelectItem value="quality">按画质区分</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {clarityMode === "bitrate" ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">比特率</span>
            <Select value={bitrate} onValueChange={setBitrate}>
              <SelectTrigger className="h-10 rounded-full bg-muted/30 border-muted-foreground/10">
                <SelectValue placeholder="自动" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="low">低</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">画面质量</span>
            <Select value={quality} onValueChange={setQuality}>
              <SelectTrigger className="h-10 rounded-full bg-muted/30 border-muted-foreground/10">
                <SelectValue placeholder="高清" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uhd">超清</SelectItem>
                <SelectItem value="hd">高清</SelectItem>
                <SelectItem value="sd">标清</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">分辨率</span>
          <div>
            <Select
              value={resolution || "3840x2160"}
              onValueChange={(v) => {
                applyResolution(v);
              }}
            >
              <SelectTrigger className="h-10 rounded-full bg-muted/30 border-muted-foreground/10">
                <SelectValue placeholder="3840x2160" />
              </SelectTrigger>
              <SelectContent>
                {resolutionOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            className="rounded-full px-5"
            variant="default"
            onClick={() => setDeviceDialogOpen(true)}
          >
            根据设备自动设置
          </Button>
          <Button
            className="rounded-full px-5"
            variant="default"
            onClick={() => setPlatformDialogOpen(true)}
          >
            根据自媒体平台自动设置
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">宽</span>
        <CorrectNumberInput
          value={width}
          onChange={handleWidthChange}
          className="w-24"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full bg-muted/30"
          onClick={() => {
            if (!ratioLocked && height !== 0) {
              setRatio(width / height);
            }
            setRatioLocked((v) => !v);
          }}
        >
          <Link2
            className={cn(
              "h-4 w-4",
              ratioLocked ? "text-primary" : "text-muted-foreground"
            )}
          />
        </Button>
        <CorrectNumberInput
          value={height}
          onChange={handleHeightChange}
          className="w-24"
        />
        <span className="text-sm text-muted-foreground">高</span>
      </div>

      <Dialog open={deviceDialogOpen} onOpenChange={setDeviceDialogOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <div className="flex h-[520px]">
            <div className="w-56 bg-muted/20 p-4 space-y-2">
              {RESOLUTION_GROUPS_DEVICES.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setActiveDeviceGroup(group.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl font-medium transition",
                    activeDeviceGroup === group.id
                      ? "bg-emerald-100 text-emerald-800"
                      : "hover:bg-muted/60 text-muted-foreground"
                  )}
                >
                  {group.label}
                </button>
              ))}
            </div>
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                {activeDevice?.resolutions.map((res) => (
                  <button
                    key={res.value}
                    onClick={() => {
                      applyResolution(res.value);
                      setDeviceDialogOpen(false);
                    }}
                    className="flex items-center gap-4 rounded-2xl bg-muted/40 hover:bg-muted/60 px-4 py-4 text-left transition"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                      ▢
                    </div>
                    <div>
                      <div className="text-base font-semibold text-foreground">{res.label}</div>
                      <div className="text-sm text-muted-foreground">{res.value.replace("x", "×")}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={platformDialogOpen} onOpenChange={setPlatformDialogOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <div className="flex h-[520px]">
            <div className="w-56 bg-muted/20 p-4 space-y-2">
              {RESOLUTION_GROUPS_PLATFORMS.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setActivePlatformGroup(group.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl font-medium transition",
                    activePlatformGroup === group.id
                      ? "bg-emerald-100 text-emerald-800"
                      : "hover:bg-muted/60 text-muted-foreground"
                  )}
                >
                  {group.label}
                </button>
              ))}
            </div>
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="grid grid-cols-1 gap-4">
                {activePlatform?.resolutions.map((res) => (
                  <button
                    key={res.value}
                    onClick={() => {
                      applyResolution(normalizeResolution(res.value));
                      setPlatformDialogOpen(false);
                    }}
                    className="flex items-center justify-between rounded-2xl bg-muted/40 hover:bg-muted/60 px-4 py-4 text-left transition"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                        ▢
                      </div>
                      <div className="text-base font-semibold text-foreground">{res.label}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {normalizeResolution(res.value).replace("x", "×")}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
