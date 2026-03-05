export default function TaskLoadingCard() {
  return (
    <div className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border shadow-sm animate-pulse">
      <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 bg-muted rounded w-1/2" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-3 bg-muted rounded" />
          <div className="h-3 bg-muted rounded" />
        </div>
      </div>
      <div className="w-24 h-6 bg-muted rounded-full" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 bg-muted rounded w-1/3" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-3 bg-muted rounded" />
          <div className="h-3 bg-muted rounded" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 bg-muted rounded" />
        <div className="h-9 w-9 bg-muted rounded" />
        <div className="h-9 w-20 bg-muted rounded" />
      </div>
    </div>
  );
}
