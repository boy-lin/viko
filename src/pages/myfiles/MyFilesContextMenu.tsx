import { FolderOpen, Info, Play, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MyFileRecord } from "./types";

type ContextMenuState = {
  file: MyFileRecord;
  x: number;
  y: number;
};

type MyFilesContextMenuProps = {
  contextMenu: ContextMenuState | null;
  onClose: () => void;
  onPlay: (file: MyFileRecord) => void;
  onDelete: (id: string) => void;
  onInfo: (file: MyFileRecord) => void;
  onOpenFolder: (path: string) => void;
};

export function MyFilesContextMenu({
  contextMenu,
  onClose,
  onPlay,
  onDelete,
  onInfo,
  onOpenFolder,
}: MyFilesContextMenuProps) {
  const { t } = useTranslation("myfiles");
  if (!contextMenu) return null;

  return (
    <div
      className="fixed z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{
        left: contextMenu.x,
        top: contextMenu.y,
      }}
      onMouseLeave={onClose}
    >
      <div
        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent"
        onClick={() => {
          onPlay(contextMenu.file);
          onClose();
        }}
      >
        <Play className="mr-2 h-4 w-4" />
        {t("actions.preview")}
      </div>
      <div className="-mx-1 my-1 h-px bg-muted" />
      <div
        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent hover:bg-accent text-red-500 focus:text-red-500"
        onClick={() => {
          onDelete(contextMenu.file.id);
          onClose();
        }}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        {t("actions.delete")}
      </div>
      <div
        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent"
        onClick={() => {
          onInfo(contextMenu.file);
          onClose();
        }}
      >
        <Info className="mr-2 h-4 w-4" />
        {t("actions.info")}
      </div>
      <div
        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground hover:bg-accent"
        onClick={() => {
          onOpenFolder(contextMenu.file.outputPath || contextMenu.file.path);
          onClose();
        }}
      >
        <FolderOpen className="mr-2 h-4 w-4" />
        {t("actions.open_in_folder")}
      </div>
    </div>
  );
}
