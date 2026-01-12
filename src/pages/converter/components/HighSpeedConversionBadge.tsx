import React, { useEffect, useState } from "react";
import { Zap, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { invoke } from "@tauri-apps/api/core";
import { useConverterStore } from "@/stores/converterStore";

interface HardwareSupport {
  h264_hardware: boolean;
  hevc_hardware: boolean;
  prores_hardware: boolean;
}

interface HighSpeedConversionBadgeProps {
  className?: string;
}

export const HighSpeedConversionBadge: React.FC<HighSpeedConversionBadgeProps> = ({
  className,
}) => {
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
  } = useConverterStore();

  useEffect(() => {
    const checkSupport = async () => {
      try {
        const result = await invoke<HardwareSupport>("check_hardware_acceleration");
        console.log('result', result)
        setSupport(result);

        if (result.h264_hardware || result.hevc_hardware) {
          const { useHardwareAcceleration, useUltraFastSpeed } = useConverterStore.getState();
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "bg-orange-50 text-orange-500 flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer hover:bg-orange-100 transition-colors",
            className
          )}
        >
          <Zap className="w-4 h-4" fill="currentColor" />
          High Speed Conversion
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-500" fill="currentColor" />
              Acceleration Settings
            </h4>
            <p className="text-sm text-muted-foreground">
              Configure hardware acceleration options.
            </p>
          </div>

          <div className="space-y-4">
            {/* Ultra-fast Speed Option */}
            <div className="flex items-start space-x-2">
              <Checkbox
                id="ultra-fast"
                checked={useUltraFastSpeed}
                onCheckedChange={(checked) => toggleUltraFastSpeed(!!checked)}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="ultra-fast"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Enable Ultra-fast Speed
                </label>
                <p className="text-xs text-muted-foreground">
                  Optimizes conversion settings for maximum speed.
                </p>
              </div>
            </div>

            {/* Hardware Acceleration Option */}
            <div className="flex items-start space-x-2">
              <Checkbox
                id="gpu-accel"
                checked={useHardwareAcceleration}
                onCheckedChange={(checked) => toggleHardwareAcceleration(!!checked)}
                disabled={!hasHardwareSupport || loading}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="gpu-accel"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Enable GPU Acceleration
                </label>
                <p className="text-xs text-muted-foreground">
                  {loading
                    ? "Checking hardware support..."
                    : hasHardwareSupport
                      ? "Uses hardware encoders (e.g., VideoToolbox) when available."
                      : "No supported hardware encoder detected."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

