import { Button } from "@/components/ui/button";

type BottomToolbarProps = {
  selectedCount: number;
  onClear: () => void;
  onExport: () => void;
  isRunning: boolean;
  progress: number;
};

export function BottomToolbar({
  selectedCount,
  onClear,
  onExport,
  isRunning,
  progress,
}: BottomToolbarProps) {
  const disabled = selectedCount === 0 || isRunning;
  return (
    <div className="h-16 border-t bg-card px-8 flex items-center justify-between">
      <div className="text-sm text-muted-foreground">{selectedCount} file(s) selected</div>
      <div className="flex gap-4">
        <Button variant="outline" onClick={onClear} disabled={disabled}>
          重新选择
        </Button>
        <Button className="gap-2" onClick={onExport} disabled={disabled}>
          {isRunning ? `处理中 ${Math.round(progress)}%` : "开始任务"}
        </Button>
      </div>
    </div>
  );
}
