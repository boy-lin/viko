import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsPanel } from "./SettingsPanel";
import { WatermarkEditorConfig } from "./types";

type BottomToolbarProps = {
  selectedCount: number;
  processingCount: number;
  finishedCount: number;
  onClear: () => void;
  onExport: () => void;
  onCancel: () => void;
  isRunning: boolean;
  isCancelling?: boolean;
  progress: number;
  config: WatermarkEditorConfig;
  onConfigChange: (patch: Partial<WatermarkEditorConfig>) => void;
};

export function BottomToolbar({
  selectedCount,
  processingCount,
  finishedCount,
  onClear,
  onExport,
  onCancel,
  isRunning,
  isCancelling = false,
  progress,
  config,
  onConfigChange,
}: BottomToolbarProps) {
  const { t } = useTranslation("watermark");
  const disabled = selectedCount === 0 || isRunning;
  return (
    <div className="py-4 border-t px-8 flex items-center justify-between">
      {/* selected count */}
      <div className="text-sm text-muted-foreground min-w-[160px]">
        {isRunning ? (
          <div className="space-y-1">
            <div>
              {t("toolbar.processingSummary", {
                processingCount,
                selectedCount,
                finishedCount,
              })}
            </div>
            <div className="h-2 w-64 rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div>{t("toolbar.selectedCount", { count: selectedCount })}</div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 cursor-pointer"
                  disabled={disabled}
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" sideOffset={12} className="w-[24rem] p-0">
                <SettingsPanel
                  config={config}
                  onChange={onConfigChange}
                  className="max-h-[70vh] rounded-md border-0 bg-transparent p-4"
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
      {/* buttons */}
      <div className="flex gap-4">
        {isRunning ? (
          <Button className="cursor-pointer" variant="outline" onClick={onCancel} disabled={isCancelling}>
            {isCancelling
              ? t("toolbar.cancelling")
              : t("toolbar.cancelProcessing")}
          </Button>
        ) : (<>
          <Button className="cursor-pointer" variant="outline" onClick={onClear} disabled={disabled}>
            {t("toolbar.reselect")}
          </Button>
          <Button className="cursor-pointer" onClick={onExport} disabled={disabled}>
            {t("toolbar.startTask")}
          </Button>
        </>)}

      </div>
    </div>
  );
}
