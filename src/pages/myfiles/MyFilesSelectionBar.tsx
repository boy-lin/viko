import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type MyFilesSelectionBarProps = {
  selectedCount: number;
  totalCount: number;
  onToggleSelectAll: () => void;
  onBatchDelete: () => void;
};

export function MyFilesSelectionBar({
  selectedCount,
  totalCount,
  onToggleSelectAll,
  onBatchDelete,
}: MyFilesSelectionBarProps) {
  const { t } = useTranslation("myfiles");
  if (selectedCount === 0) return null;

  return (
    <div className="flex-shrink-0 px-6 py-3 border-t border-border bg-background flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Checkbox checked={selectedCount === totalCount} onCheckedChange={onToggleSelectAll} />
        <span className="text-sm text-muted-foreground">
          {t("select_all", { selected: selectedCount, total: totalCount })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBatchDelete}
          className="text-red-500 hover:text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
