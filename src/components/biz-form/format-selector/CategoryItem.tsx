import { cn } from "@/lib/utils";

export default function CategoryItem({
  className,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  className?: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer flex items-center justify-between px-3 py-3 font-medium transition-colors hover:bg-muted/50 text-muted-foreground",
        active &&
        "bg-accent text-accent-foreground hover:bg-accent/80",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </div>
      {/* {active && <ChevronRight className="w-3 h-3" />} */}
    </button>
  );
}
