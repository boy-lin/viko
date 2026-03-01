import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

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
}: BottomToolbarProps) {
  const { t } = useTranslation("watermark");
  const disabled = selectedCount === 0 || isRunning;
  return (
    <div className="h-16 border-t bg-card px-8 flex items-center justify-between">
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
          <div>{t("toolbar.selectedCount", { count: selectedCount })}</div>
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
