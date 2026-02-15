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
import { ConvertVideoTaskArgs } from "@/lib/bridge";
import { VideoResolutionSelect } from "@/components/biz-form/VideoResolutionSelect";
import { VideoBitrateSelect } from "@/components/biz-form/VideoBitrateSelect";
import { VideoQualitySelect } from "@/components/biz-form/VideoQualitySelect";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

// Derived state from resolution prop
const normalizeResolution = (value: string) => value.replace("×", "x");

const parseResolution = (value: string | undefined): { w: number; h: number } | null => {
  if (!value) return null;
  const normalized = normalizeResolution(value);
  const [w, h] = normalized.split("x");
  if (!w || !h) return null;
  return { w: parseInt(w), h: parseInt(h) };
};

interface VideoSimpleSettingsProps {
  resolution?: string;
  video_bitrate?: number;
  crf?: number;
  onChange: (args: Partial<ConvertVideoTaskArgs>) => void;
}

export const VideoSimpleSettings: React.FC<VideoSimpleSettingsProps> = ({
  resolution,
  video_bitrate,
  crf,
  onChange,
}) => {
  const [clarityMode, setClarityMode] = useState("bitrate");
  const [ratioLocked, setRatioLocked] = useState(true);


  const resolutionInfo = useMemo(() => {
    const parsed = parseResolution(resolution);
    if (!parsed) return { hideCustom: true, width: 0, height: 0, ratio: 16 / 9 };
    return {
      width: parsed.w,
      height: parsed.h,
      ratio: parsed.h ? parsed.w / parsed.h : 16 / 9
    };
  }, [resolution]);

  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [platformDialogOpen, setPlatformDialogOpen] = useState(false);
  const [activeDeviceGroup, setActiveDeviceGroup] = useState(RESOLUTION_GROUPS_DEVICES[0]?.id || "");
  const [activePlatformGroup, setActivePlatformGroup] = useState(RESOLUTION_GROUPS_PLATFORMS[0]?.id || "");

  const [resolutionMode, setResolutionMode] = useState("preset");

  const applyResolution = (value: string) => {
    onChange({ resolution: value });
  };

  const handleWidthChange = (next: number) => {
    let nextH = resolutionInfo.height;
    if (ratioLocked) {
      nextH = Math.max(1, Math.round(next / resolutionInfo.ratio));
    }
    onChange({ resolution: `${next}x${nextH}`, });
  };

  const handleHeightChange = (next: number) => {
    let nextW = resolutionInfo.width;
    if (ratioLocked) {
      nextW = Math.max(1, Math.round(next * resolutionInfo.ratio));
    }
    onChange({ resolution: `${nextW}x${next}` });
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
            <SelectTrigger className="cursor-pointer h-9 rounded-lg bg-muted/30 border-muted-foreground/10">
              <SelectValue placeholder="按码率区分" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bitrate">按码率区分</SelectItem>
              <SelectItem value="quality">按画质区分</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {clarityMode === "bitrate" ? (
          <div className="w-full">
            <VideoBitrateSelect
              value={video_bitrate ? video_bitrate.toString() : "auto"}
              onValueChange={(val) => {
                onChange({
                  video_bitrate: val === "auto" ? undefined : parseInt(val),
                  crf: undefined,
                  rc_mode: undefined
                });
              }}
            />
          </div>
        ) : (
          <div className="w-full">
            <VideoQualitySelect
              value={crf}
              onValueChange={(val) => {
                onChange({
                  crf: val,
                  video_bitrate: undefined,
                  rc_mode: val !== undefined ? "crf" : undefined
                });
              }}
            />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">分辨率</span>
          <div>
            <RadioGroup className="flex" value={resolutionMode} onValueChange={(val) => {
              setResolutionMode(val)
              if (val === "custom_size") {
                onChange({ resolution: "1920x1080" });
              }
            }}>
              {
                [
                  { value: "preset", label: "预设" },
                  { value: "custom_size", label: "自定义" },
                ].map((opt) => (
                  <Label className="flex items-center gap-3 cursor-pointer" htmlFor={opt.value}>
                    <RadioGroupItem className="cursor-pointer" value={opt.value} id={opt.value} />
                    <span>{opt.label}</span>
                  </Label>
                ))
              }
            </RadioGroup>

          </div>
        </div>
        {resolutionMode === "custom_size" ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">宽</span>
            <CorrectNumberInput
              value={resolutionInfo.width}
              onChange={handleWidthChange}
              className="w-24"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cursor-pointer h-9 w-9 rounded-lg bg-muted/30"
              onClick={() => {
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
              value={resolutionInfo.height}
              onChange={handleHeightChange}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">高</span>
          </div>
        ) : <VideoResolutionSelect
          value={resolution}
          onValueChange={applyResolution}
          className="h-9 rounded-lg bg-muted/30 border-muted-foreground/10"
          placeholder="自动"
        />}
        <div className="flex items-center gap-3">
          <Button
            className="cursor-pointer rounded-lg px-5 text-xs"
            variant="default"
            onClick={() => setDeviceDialogOpen(true)}
          >
            根据设备设置
          </Button>
          <Button
            className="cursor-pointer rounded-lg px-5 text-xs"
            variant="default"
            onClick={() => setPlatformDialogOpen(true)}
          >
            根据自媒体平台设置
          </Button>
        </div>
      </div>



      <Dialog open={deviceDialogOpen} onOpenChange={setDeviceDialogOpen}>
        <DialogContent className="sm:max-w-[72vw] p-0 overflow-hidden">
          <div className="flex h-[520px]">
            <div className="w-56 bg-muted/20 p-4 space-y-2">
              {RESOLUTION_GROUPS_DEVICES.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setActiveDeviceGroup(group.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg font-medium transition",
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
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
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
        <DialogContent className="sm:max-w-[72vw] p-0 overflow-hidden">
          <div className="flex h-[520px]">
            <div className="w-56 bg-muted/20 p-4 space-y-2">
              {RESOLUTION_GROUPS_PLATFORMS.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setActivePlatformGroup(group.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-lg font-medium transition",
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
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
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
