import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BadgeQuestionMark } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  RESOLUTION_GROUPS_DEVICES,
  RESOLUTION_GROUPS_PLATFORMS,
} from "@/data/resolution";
import { VideoResolutionSelect } from "@/components/biz-form/VideoResolutionSelect";
import { VideoSizeInputGroup } from "@/components/biz-form/VideoSizeInputGroup";

const normalizeResolution = (value: string) => value.replace("×", "x");

interface VideoResolutionSectionProps {
  label?: string;
  helpText?: string;
  resolution?: string;
  onChange: (resolution: string) => void;
  className?: string;
  showMoreBtns?: boolean;
}

export function VideoResolutionSection({
  label,
  helpText,
  resolution,
  onChange,
  className,
  showMoreBtns = false,
}: VideoResolutionSectionProps) {
  const { t } = useTranslation("task");
  const [resolutionMode, setResolutionMode] = useState("preset");
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [platformDialogOpen, setPlatformDialogOpen] = useState(false);
  const [activeDeviceGroup, setActiveDeviceGroup] = useState(
    RESOLUTION_GROUPS_DEVICES[0]?.id || "",
  );
  const [activePlatformGroup, setActivePlatformGroup] = useState(
    RESOLUTION_GROUPS_PLATFORMS[0]?.id || "",
  );

  const activeDevice = useMemo(
    () => RESOLUTION_GROUPS_DEVICES.find((g) => g.id === activeDeviceGroup),
    [activeDeviceGroup],
  );
  const activePlatform = useMemo(
    () => RESOLUTION_GROUPS_PLATFORMS.find((g) => g.id === activePlatformGroup),
    [activePlatformGroup],
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-1">
        <Label>{label}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64 whitespace-normal break-words">
            {t(helpText ?? "videoCompressor.fields.clarityHelp")}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-4">
        <RadioGroup
          className="flex"
          value={resolutionMode}
          onValueChange={(val) => {
            setResolutionMode(val);
            // if (val === "custom_size") {
            //   onChange("1920x1080");
            // }
          }}
        >
          {[
            { value: "preset", label: t("bizForm.videoResolution.mode.preset") },
            { value: "custom_size", label: t("bizForm.videoResolution.mode.custom") },
          ].map((opt) => (
            <Label
              key={opt.value}
              className="flex items-center gap-3 cursor-pointer"
              htmlFor={opt.value}
            >
              <RadioGroupItem
                className="cursor-pointer"
                value={opt.value}
                id={opt.value}
              />
              <span className="whitespace-nowrap text-sm">{opt.label}</span>
            </Label>
          ))}
        </RadioGroup>
        {resolutionMode === "custom_size" ? (
          <VideoSizeInputGroup
            resolution={resolution}
            widthPlaceholder={t("settings.video.fields.width")}
            heightPlaceholder={t("settings.video.fields.height")}
            onChange={onChange}
          />
        ) : (
          <VideoResolutionSelect
            value={resolution}
            onValueChange={onChange}
            showNumberInput={false}
            className="min-w-[8em] h-9 rounded-lg bg-muted/30 border-muted-foreground/10"
            placeholder={t("common.auto")}
          />
        )}
      </div>

      {
        showMoreBtns ? <div className="flex items-center gap-3">
          <Button
            className="cursor-pointer rounded-lg px-5 text-xs"
            variant="outline"
            onClick={() => setDeviceDialogOpen(true)}
          >
            {t("bizForm.videoResolution.byDevice")}
          </Button>
          <Button
            className="cursor-pointer rounded-lg px-5 text-xs"
            variant="outline"
            onClick={() => setPlatformDialogOpen(true)}
          >
            {t("bizForm.videoResolution.byPlatform")}
          </Button>

          <Dialog open={deviceDialogOpen} onOpenChange={setDeviceDialogOpen}>
            <DialogContent className="sm:max-w-[72vw] p-0 overflow-hidden">
              <DialogTitle className="sr-only">{t("bizForm.videoResolution.byDevice")}</DialogTitle>
              <div className="flex h-[520px]">
                <div className="w-56 bg-muted/20 p-4 space-y-4">
                  {RESOLUTION_GROUPS_DEVICES.map((group) => (
                    <button
                      key={group.id}
                      onClick={() => setActiveDeviceGroup(group.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-lg font-medium transition",
                        activeDeviceGroup === group.id
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted/60 text-muted-foreground",
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
                          onChange(res.value);
                          setDeviceDialogOpen(false);
                        }}
                        className="flex flex-col items-start gap-2 rounded-xl bg-muted/40 hover:bg-muted/60 p-4"
                      >
                        <div className="text-base font-semibold text-foreground truncate max-w-full" title={res.label}>
                          {res.label}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {res.value.replace("x", "×")}
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
              <DialogTitle className="sr-only">{t("bizForm.videoResolution.byPlatformShort")}</DialogTitle>
              <div className="flex h-[520px]">
                <div className="w-56 bg-muted/20 p-4 space-y-2">
                  {RESOLUTION_GROUPS_PLATFORMS.map((group) => (
                    <button
                      key={group.id}
                      onClick={() => setActivePlatformGroup(group.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-lg font-medium transition",
                        activePlatformGroup === group.id
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted/60 text-muted-foreground",
                      )}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 p-6 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    {activePlatform?.resolutions.map((res) => (
                      <button
                        key={res.value}
                        onClick={() => {
                          onChange(normalizeResolution(res.value));
                          setPlatformDialogOpen(false);
                        }}
                        className="flex flex-col items-start gap-2 rounded-xl bg-muted/40 hover:bg-muted/60 p-4 text-left transition"
                      >
                        <div className="text-base font-semibold text-foreground truncate max-w-full" title={res.label}>
                          {res.label}
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
        </div> :
          null
      }
    </div>
  );
}
