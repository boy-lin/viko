import { useState, useEffect, useCallback } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ShakaPlayer } from "@/components/player/ShakaPlayer";
import { MusicPlayer } from "@/components/player/MusicPlayer";
import { ImageViewer } from "@/components/player/ImageViewer";
import { bridge, type MyFileItem } from "@/lib/bridge";
import { FileType } from "@/types/tasks";
import { useTranslation } from "react-i18next";
import { MyFilesToolbar } from "./MyFilesToolbar";
import { MyFilesGrid } from "./MyFilesGrid";
import { MyFilesSelectionBar } from "./MyFilesSelectionBar";
import { MyFilesContextMenu } from "./MyFilesContextMenu";
import { MyFilesDialogs } from "./MyFilesDialogs";
import { extractFilenameFromPath } from "@/lib/utils";
import type { MyFileRecord, TabItem } from "./types";

type FilterType = FileType;
type SortBy = "date" | "name";
type SortOrder = "asc" | "desc";

const TAB_ITEMS: TabItem[] = [
  { value: "all", labelKey: "tabs.all" },
  { value: FileType.Video, labelKey: "tabs.video" },
  { value: FileType.Audio, labelKey: "tabs.audio" },
  { value: FileType.Image, labelKey: "tabs.image" },
];

export default function MyFilesPage() {
  const { i18n } = useTranslation("myfiles");
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
        <MyFilesToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortByChange={setSortBy}
          onToggleSortOrder={() =>
            setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
          }
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={TAB_ITEMS}
        />
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto px-4 py-2">
        <MyFilesGrid
          files={myFiles}
          selectedFiles={selectedFiles}
          isLoading={isLoading}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={handleLoadMore}
          onToggleSelect={toggleSelect}
          onPlay={handlePlay}
          onDelete={handleDelete}
          onInfo={handleShowInfo}
          onOpenFolder={handleOpenFolder}
          onContextMenu={(file, x, y) => setContextMenu({ file, x, y })}
        />
      </div>

      {/* 底部操作栏 */}
      <MyFilesSelectionBar
        selectedCount={selectedFiles.size}
        totalCount={myFiles.length}
        onToggleSelectAll={toggleSelectAll}
        onBatchDelete={handleBatchDelete}
      />

      <MyFilesContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onPlay={handlePlay}
        onDelete={handleDelete}
        onInfo={handleShowInfo}
        onOpenFolder={(path) => handleOpenFolder(path)}
      />

      <MyFilesDialogs
        playDialogOpen={playDialogOpen}
        onPlayDialogOpenChange={setPlayDialogOpen}
        renderPlayer={renderPlayer}
        playingFile={playingFile}
        infoDialogOpen={infoDialogOpen}
        onInfoDialogOpenChange={setInfoDialogOpen}
        infoFile={infoFile}
        language={i18n.language}
      />
    </div>
  );
}
