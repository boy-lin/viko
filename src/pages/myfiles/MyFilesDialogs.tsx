import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDuration } from "@/lib/time";
import { formatFileSize } from "@/lib/file";
import { useTranslation } from "react-i18next";
import type { MyFileRecord } from "./types";

type MyFilesDialogsProps = {
  playDialogOpen: boolean;
  onPlayDialogOpenChange: (open: boolean) => void;
  renderPlayer: () => React.ReactNode;
  playingFile: MyFileRecord | null;
  infoDialogOpen: boolean;
  onInfoDialogOpenChange: (open: boolean) => void;
  infoFile: MyFileRecord | null;
  language: string;
};

export function MyFilesDialogs({
  playDialogOpen,
  onPlayDialogOpenChange,
  renderPlayer,
  playingFile,
  infoDialogOpen,
  onInfoDialogOpenChange,
  infoFile,
  language,
}: MyFilesDialogsProps) {
  const { t } = useTranslation("myfiles");

  return (
    <>
      <Dialog open={playDialogOpen} onOpenChange={onPlayDialogOpenChange}>
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

      <Dialog open={infoDialogOpen} onOpenChange={onInfoDialogOpenChange}>
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
                      language === "zh" ? "zh-CN" : "en-US"
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
    </>
  );
}
