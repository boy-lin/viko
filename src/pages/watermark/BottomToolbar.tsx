import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

type BottomToolbarProps = {
  selectedCount: number;
  onClear: () => void;
  onExport: () => void;
};

export function BottomToolbar({ selectedCount, onClear, onExport }: BottomToolbarProps) {
  return (
    <div className="h-16 border-t bg-card px-8 flex items-center justify-between">
      <div className="text-sm text-muted-foreground">{selectedCount} file(s) selected</div>
      <div className="flex gap-4">
        <Button variant="outline" onClick={onClear} disabled={selectedCount === 0}>
          Clear
        </Button>
        <Button className="gap-2" onClick={onExport} disabled={selectedCount === 0}>
          <Download className="w-4 h-4" /> Export
        </Button>
      </div>
    </div>
  );
}
