import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CategoryItem({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer w-full flex items-center justify-between px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 text-muted-foreground rounded-r-lg mr-2",
        active &&
          "bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </div>
      {active && <ChevronRight className="w-3 h-3" />}
    </button>
  );
}
