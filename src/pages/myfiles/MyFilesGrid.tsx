import { CheckCircle2, FolderOpen, Info, MoreVertical, Play, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { cn } from "@/lib/utils";
import type { MyFileRecord } from "./types";

type MyFilesGridProps = {
  files: MyFileRecord[];
  selectedFiles: Set<string>;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onToggleSelect: (id: string) => void;
  onPlay: (file: MyFileRecord) => void;
  onDelete: (id: string) => void;
  onInfo: (file: MyFileRecord) => void;
  onOpenFolder: (path?: string) => void;
  onContextMenu: (file: MyFileRecord, x: number, y: number) => void;
};

export function MyFilesGrid({
  files,
  selectedFiles,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onToggleSelect,
  onPlay,
  onDelete,
  onInfo,
  onOpenFolder,
  onContextMenu,
}: MyFilesGridProps) {
  const { t } = useTranslation("myfiles");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground">{t("empty")}</div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {files.map((file) => (
          <div
            key={file.id}
            className="group relative flex flex-col"
            onContextMenu={(e) => {
              e.preventDefault();
              onContextMenu(file, e.clientX, e.clientY);
            }}
          >
            <div className="relative aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30 mb-2 shadow-sm transition-shadow hover:shadow-md">
              <MediaThumbnail
                path={file.outputPath || file.path}
                title={file.title}
                className="w-full h-full"
              />

              <div
                className={cn(
                  "absolute top-2 left-2 z-10 transition-opacity",
                  selectedFiles.has(file.id)
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(file.id);
                }}
              >
                <div
                  role="checkbox"
                  aria-checked={selectedFiles.has(file.id)}
                  className="cursor-pointer"
                >
                  {selectedFiles.has(file.id) ? (
                    <div className="bg-background rounded-full">
                      <CheckCircle2 className="w-5 h-5 text-green-500 fill-green-100 dark:fill-green-900" />
                    </div>
                  ) : (
                    <Checkbox
                      checked={false}
                      className="bg-background/90 backdrop-blur-sm border-2 border-white/70 data-[state=checked]:bg-primary data-[state=checked]:border-primary pointer-events-none"
                    />
                  )}
                </div>
              </div>

              <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <HoverCard openDelay={0} closeDelay={120}>
                  <HoverCardTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 bg-background/90 backdrop-blur-sm hover:bg-background/95"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </HoverCardTrigger>
                  <HoverCardContent align="end" side="bottom" sideOffset={8} className="w-48 p-2 space-y-1">
                    <button
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlay(file);
                      }}
                    >
                      <Play className="h-4 w-4" />
                      {t("actions.play")}
                    </button>
                    <div className="-mx-2 h-px bg-muted" />
                    <button
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(file.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("actions.delete")}
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInfo(file);
                      }}
                    >
                      <Info className="h-4 w-4" />
                      {t("actions.info")}
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFolder(file.outputPath);
                      }}
                    >
                      <FolderOpen className="h-4 w-4" />
                      {t("actions.open_in_folder")}
                    </button>
                  </HoverCardContent>
                </HoverCard>
              </div>
            </div>
            <div className="text-sm text-foreground truncate text-center px-1" title={file.title}>
              {file.title}
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center mt-6 mb-8">
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="min-w-[120px]"
          >
            {isLoadingMore ? t("loading") : t("load_more")}
          </Button>
        </div>
      )}
      {!hasMore && files.length > 0 && (
        <div className="flex justify-center mt-6 mb-8">
          <span className="text-sm text-muted-foreground">{t("loaded_all")}</span>
        </div>
      )}
    </>
  );
}
