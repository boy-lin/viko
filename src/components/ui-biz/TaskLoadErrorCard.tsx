import { ShieldAlert, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TaskLoadErrorCardProps {
  loadError: string;
  onRemove: () => void;
}

export default function TaskLoadErrorCard({
  loadError,
  onRemove,
}: TaskLoadErrorCardProps) {
  const { t } = useTranslation("converter");

  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-red-200 shadow-sm">
      <div className="w-20 h-20 rounded-lg bg-red-50 flex items-center justify-center text-red-500 flex-shrink-0">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-red-600">加载失败</div>
        <div className="text-sm text-muted-foreground mt-1 truncate">
          {loadError}
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("actions.delete")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
