import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Trash2,
  ArrowUp,
  ArrowDown,
  MoreVertical,
  Play,
  Info,
  FolderOpen,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaThumbnail } from "@/components/MediaThumbnail";
import { cn } from "@/lib/utils";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { formatFileSize } from "@/lib/file";
import { formatDuration } from "@/lib/time";
import { ShakaPlayer } from "@/components/player/ShakaPlayer";
import { MusicPlayer } from "@/components/player/MusicPlayer";
import { ImageViewer } from "@/components/player/ImageViewer";
import { bridge, type MyFileItem } from "@/lib/bridge";
import { FileType } from "@/types/tasks";
import { extractFilenameFromPath } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type MyFileRecord = {
  id: string;
  title: string;
  fileType: FileType
  path: string;
  outputPath?: string;
  thumbnail?: string;
  size?: number;
  duration?: number;
  extension?: string;
  displayFormat?: string;
  displayResolution?: string;
  createdAt: number;
  taskType: string;
};

type FilterType = FileType;
type SortBy = "date" | "name";
type SortOrder = "asc" | "desc";

export default function MyFilesPage() {
  const { t, i18n } = useTranslation("myfiles");
  const [myFiles, setMyFiles] = useState<MyFileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterType>();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [playDialogOpen, setPlayDialogOpen] = useState(false);
  const [playingFile, setPlayingFile] = useState<MyFileRecord | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [infoFile, setInfoFile] = useState<MyFileRecord | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    file: MyFileRecord;
    x: number;
    y: number;
  } | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const mapHistoryToRecord = (item: MyFileItem): MyFileRecord => {
    const outputPath = item.output_path || undefined;
    const sourcePath = outputPath || item.input_path;
    const ext = sourcePath.split(".").pop()?.toLowerCase();
    return {
      id: item.id,
      title: item.title || extractFilenameFromPath(sourcePath),
      fileType: item.media_type,
      path: item.input_path,
      outputPath,
      thumbnail: item.thumbnail ?? undefined,
      size: item.output_size ?? undefined,
      duration:
        item.output_duration !== undefined
          ? Number(item.output_duration) || undefined
          : undefined,
      extension: ext,
      displayFormat: ext,
      createdAt: item.created_at,
      taskType: item.task_type,
    };
  };

  // 加载数据
  const loadFiles = async (pageNum: number, isReset: boolean = false) => {
    try {
      if (pageNum === 1) setIsLoading(true);
      else setIsLoadingMore(true);

      const keyword = searchQuery.trim();
      const pageSize = 8;

      const sortByParam: "date" | "name" = sortBy === "name" ? "name" : "date";
      const pageData = await bridge.getMyFilesPage(
        pageSize,
        (pageNum - 1) * pageSize,
        keyword || undefined,
        sortByParam,
        sortOrder,
        activeTab
      );
      const newFiles = pageData.list.map(mapHistoryToRecord);

      if (isReset) {
        setMyFiles(newFiles);
      } else {
        setMyFiles(prev => [...prev, ...newFiles]);
      }

      setHasMore(pageData.hasMore);
    } catch (error) {
      console.error("Failed to load my files:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  // Initial load or Sort/Order change triggers reset
  useEffect(() => {
    setPage(1);
    loadFiles(1, true);
  }, [sortBy, sortOrder, activeTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadFiles(1, true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleLoadMore = () => {
    if (!hasMore || isLoadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadFiles(nextPage, false);
  };

  // 批量删除
  const handleBatchDelete = useCallback(async () => {
    try {
      await Promise.all(
        Array.from(selectedFiles).map((id) => bridge.deleteTaskHistory(id))
      );
      setMyFiles((prev) => prev.filter((file) => !selectedFiles.has(file.id)));
      setSelectedFiles(new Set());
    } catch (error) {
      console.error("Failed to batch delete:", error);
    }
  }, [selectedFiles]);

  // 切换全选
  const toggleSelectAll = useCallback(() => {
    if (selectedFiles.size === myFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(myFiles.map((f) => f.id)));
    }
  }, [myFiles, selectedFiles.size]);

  // 切换单个文件选择
  const toggleSelect = useCallback((id: string) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // 打开文件夹
  const handleOpenFolder = useCallback(async (outputPath?: string) => {
    if (!outputPath) return;
    try {
      await revealItemInDir(outputPath);
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  }, []);

  // 播放文件
  const handlePlay = useCallback((file: MyFileRecord) => {
    setPlayingFile(file);
    setPlayDialogOpen(true);
  }, []);

  // 显示媒体信息
  const handleShowInfo = useCallback((file: MyFileRecord) => {
    setInfoFile(file);
    setInfoDialogOpen(true);
  }, []);

  // 删除单个文件
  const handleDelete = useCallback(async (id: string) => {
    try {
      await bridge.deleteTaskHistory(id);
      setMyFiles((prev) => prev.filter((file) => file.id !== id));
      setSelectedFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (error) {
      console.error("Failed to delete file:", error);
    }
  }, []);

  // 渲染播放器
  const renderPlayer = () => {
    if (!playingFile) return null;

    switch (playingFile.fileType) {
      case "video":
        return (
          <ShakaPlayer
            filePath={playingFile.outputPath || playingFile.path}
            title={playingFile.title}
            className="w-full"
            autoPlay={true}
          />
        );
      case "audio":
        return (
          <MusicPlayer
            filePath={playingFile.outputPath || playingFile.path}
            title={playingFile.title}
            className="w-full"
            autoPlay={true}
          />
        );
      case "image":
        return (
          <ImageViewer
            imagePath={playingFile.outputPath || playingFile.path}
            alt={playingFile.title}
            className="w-full h-full"
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 头部 */}
      <div className="flex-shrink-0 px-2 pt-0 pb-0 space-y-4">
        {/* <h1 className="text-2xl font-semibold text-foreground">我的文件</h1> */}


        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("search.placeholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* 排序方式选择 */}
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortBy)}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder={t("sort.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">{t("sort.date")}</SelectItem>
              <SelectItem value="name">{t("sort.name")}</SelectItem>
            </SelectContent>
          </Select>

          {/* 排序图标 - 点击切换升序/降序 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
            }
            title={sortOrder === "asc" ? t("sort.asc") : t("sort.desc")}
          >
            {sortOrder === "asc" ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        {/* 导航标签 */}
        <div className="flex items-center justify-between gap-4">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as FilterType)}
          >
            <TabsList className="bg-transparent p-0 h-auto border-b border-transparent">
              <TabsTrigger
                value="all"
                className={cn(
                  "px-4 py-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent",
                  activeTab === undefined && "border-primary"
                )}
              >
                {t("tabs.all")}
              </TabsTrigger>
              <TabsTrigger
                value={FileType.Video}
                className={cn(
                  "px-4 py-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent",
                  activeTab === FileType.Video && "border-primary"
                )}
              >
                {t("tabs.video")}
              </TabsTrigger>
              <TabsTrigger
                value="audio"
                className={cn(
                  "px-4 py-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent",
                  activeTab === "audio" && "border-primary"
                )}
              >
                {t("tabs.audio")}
              </TabsTrigger>
              <TabsTrigger
                value="image"
                className={cn(
                  "px-4 py-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent",
                  activeTab === "image" && "border-primary"
                )}
              >
                {t("tabs.image")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto px-4 py-2">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">{t("loading")}</div>
          </div>
        )}
        {myFiles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">{t("empty")}</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {myFiles.map((file) => (
              <div
                key={file.id}
                className="group relative flex flex-col"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    file,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }}
              >
                {/* 文件卡片 */}
                <div className="relative aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30 mb-2 shadow-sm transition-shadow hover:shadow-md">
                  <MediaThumbnail
                    path={file.outputPath || file.path}
                    title={file.title}
                    fileType={file.fileType}
                    thumbnailPath={file.thumbnail}
                    disableAutoGenerate={true}
                    className="w-full h-full"
                  />
                  {/* 选择复选框 - hover 时显示 */}
                  <div
                    className={cn(
                      "absolute top-2 left-2 z-10 transition-opacity",
                      selectedFiles.has(file.id)
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(file.id);
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
                  {/* 右上角操作按钮 */}
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* 更多操作：hover 弹出 */}
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
                            handlePlay(file);
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
                            handleDelete(file.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("actions.delete")}
                        </button>
                        <button
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowInfo(file);
                          }}
                        >
                          <Info className="h-4 w-4" />
                          {t("actions.info")}
                        </button>
                        <button
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenFolder(file.outputPath);
                          }}
                        >
                          <FolderOpen className="h-4 w-4" />
                          {t("actions.open_in_folder")}
                        </button>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                </div>
                {/* 文件名 */}
                <div className="text-sm text-foreground truncate text-center px-1" title={file.title}>
                  {file.title}
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center mt-6 mb-8">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="min-w-[120px]"
            >
              {isLoadingMore ? t("loading") : t("load_more")}
            </Button>
          </div>
        )}
        {!hasMore && !isLoading && myFiles.length > 0 && (
          <div className="flex justify-center mt-6 mb-8">
            <span className="text-sm text-muted-foreground">{t("loaded_all")}</span>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      {selectedFiles.size > 0 && (
        <div className="flex-shrink-0 px-6 py-3 border-t border-border bg-background flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selectedFiles.size === myFiles.length}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm text-muted-foreground">
              {t("select_all", { selected: selectedFiles.size, total: myFiles.length })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBatchDelete}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 播放对话框 */}
      <Dialog open={playDialogOpen} onOpenChange={setPlayDialogOpen}>
        <DialogContent
          className="bg-transparent border-0 shadow-none max-w-6xl w-[95vw] p-0"
          showCloseButton={true}
        >
          <DialogTitle className="sr-only">
            {playingFile?.title || t("player.title")}
          </DialogTitle>
          {playingFile && renderPlayer()}
        </DialogContent>
      </Dialog>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent"
            onClick={() => {
              handlePlay(contextMenu.file);
              setContextMenu(null);
            }}
          >
            <Play className="mr-2 h-4 w-4" />
            {t("actions.preview")}
          </div>
          <div className="-mx-1 my-1 h-px bg-muted" />
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent hover:bg-accent text-red-500 focus:text-red-500"
            onClick={() => {
              handleDelete(contextMenu.file.id);
              setContextMenu(null);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("actions.delete")}
          </div>
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent"
            onClick={() => {
              handleShowInfo(contextMenu.file);
              setContextMenu(null);
            }}
          >
            <Info className="mr-2 h-4 w-4" />
            {t("actions.info")}
          </div>
          <div
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent"
            onClick={() => {
              handleOpenFolder(
                contextMenu.file.outputPath || contextMenu.file.path
              );
              setContextMenu(null);
            }}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            {t("actions.open_in_folder")}
          </div>
        </div>
      )}

      {/* 媒体信息对话框 */}
      <Dialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("info.title")}</DialogTitle>
          </DialogHeader>
          {infoFile && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground mb-1">{t("info.file_name")}</div>
                  <div className="font-medium break-all">{infoFile.title}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">{t("info.file_type")}</div>
                  <div className="font-medium">
                    {t(`file_type.${infoFile.fileType}`, t("file_type.other"))}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">{t("info.file_size")}</div>
                  <div className="font-medium">
                    {formatFileSize(infoFile.size || 0)}
                  </div>
                </div>
                {infoFile.duration && (
                  <div>
                    <div className="text-muted-foreground mb-1">{t("info.duration")}</div>
                    <div className="font-medium">
                      {formatDuration(infoFile.duration)}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-muted-foreground mb-1">{t("info.format")}</div>
                  <div className="font-medium uppercase">
                    {infoFile.displayFormat || infoFile.extension || t("info.unknown")}
                  </div>
                </div>
                {infoFile.displayResolution && (
                  <div>
                    <div className="text-muted-foreground mb-1">{t("info.resolution")}</div>
                    <div className="font-medium">
                      {infoFile.displayResolution}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-muted-foreground mb-1">{t("info.task_type")}</div>
                  <div className="font-medium">
                    {infoFile.taskType}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">{t("info.created_at")}</div>
                  <div className="font-medium">
                    {new Date(infoFile.createdAt).toLocaleString(
                      i18n.language === "zh" ? "zh-CN" : "en-US"
                    )}
                  </div>
                </div>
              </div>
              {infoFile.path && (
                <div>
                  <div className="text-muted-foreground mb-1 text-sm">{t("info.source_path")}</div>
                  <div className="font-medium break-all text-sm">
                    {infoFile.path}
                  </div>
                </div>
              )}
              {infoFile.outputPath && (
                <div>
                  <div className="text-muted-foreground mb-1 text-sm">{t("info.output_path")}</div>
                  <div className="font-medium break-all text-sm">
                    {infoFile.outputPath}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
