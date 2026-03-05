import React, { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { bridge, type HardwareSupport } from "@/lib/bridge";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface HighSpeedConversionBadgeProps {
  className?: string;
}

export const HighSpeedConversionBadge: React.FC<
  HighSpeedConversionBadgeProps
> = ({ className }) => {
  const [support, setSupport] = useState<HardwareSupport>({
    h264_hardware: false,
    hevc_hardware: false,
    prores_hardware: false,
  });
  const [loading, setLoading] = useState(true);

  const {
    useHardwareAcceleration,
    useUltraFastSpeed,
    toggleHardwareAcceleration,
    toggleUltraFastSpeed,
  } = useSettingsStore();

  useEffect(() => {
    const checkSupport = async () => {
      try {
        if (!bridge.isTauri()) {
          setLoading(false);
          return;
        }
        const result = await bridge.checkHardwareAcceleration();
        setSupport(result);

        if (result.h264_hardware || result.hevc_hardware) {
          const { useHardwareAcceleration, useUltraFastSpeed } =
            useSettingsStore.getState();
          if (!useHardwareAcceleration) {
            toggleHardwareAcceleration(true);
          }
          if (!useUltraFastSpeed) {
            toggleUltraFastSpeed(true);
          }
        }
      } catch (error) {
        console.error("Failed to check hardware support:", error);
      } finally {
        setLoading(false);
      }
    };
    checkSupport();
  }, []);

  const hasHardwareSupport = support.h264_hardware || support.hevc_hardware;
  const { t } = useTranslation();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="icon"
          className={cn(
            "w-auto 8 bg-orange-50 text-orange-500 flex items-center gap-2 px-3 py-1.4 rounded-md text-sm font-medium cursor-pointer hover:bg-orange-100 transition-colors",
            className
          )}
        >
          <Zap className="w-4 h-4" fill="currentColor" />
          {t("acceleration.badge_high")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-500" fill="currentColor" />
              {t("acceleration.title")}
            </h4>
            {/* <p className="text-sm text-muted-foreground">
              {t("acceleration.description")}
            </p> */}
          </div>

          <div className="space-y-4">
            {/* Ultra-fast Speed Option */}
            <div className="flex items-start space-x-2">
              <Checkbox
                className="rounded-[4px] cursor-pointer"
                id="ultra-fast"
                checked={useUltraFastSpeed}
                onCheckedChange={(checked) => toggleUltraFastSpeed(!!checked)}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="ultra-fast"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {t("acceleration.ultra_fast_label")}
                </label>
                <p className="text-xs text-muted-foreground">
                  {t("acceleration.ultra_fast_desc")}
                </p>
              </div>
            </div>

            {/* Hardware Acceleration Option */}
            <div className="flex items-start space-x-2">
              <Checkbox
                id="gpu-accel"
                className="rounded-[4px] cursor-pointer"
                checked={useHardwareAcceleration}
                onCheckedChange={(checked) =>
                  toggleHardwareAcceleration(!!checked)
                }
                disabled={!hasHardwareSupport || loading}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="gpu-accel"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {t("acceleration.gpu_label")}
                </label>
                <p className="text-xs text-muted-foreground">
                  {loading
                    ? t("acceleration.checking")
                    : hasHardwareSupport
                      ? t("acceleration.gpu_desc_available")
                      : t("acceleration.gpu_desc_unavailable")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
