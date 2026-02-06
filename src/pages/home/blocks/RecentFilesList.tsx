import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { converterDB } from "@/db/converterDB"
import { MediaThumbnail } from "@/components/MediaThumbnail"
import { formatFileSize } from "@/lib/file"
import { formatDuration } from "@/lib/time"
import { ConverterTask } from "@/types/tasks"
import { useTranslation } from "react-i18next"

type MyFileRecord = ConverterTask & {
  createdAt: number;
  taskType: "convert" | "compress";
  isFavorite?: boolean;
};

export const RecentFilesList = () => {
  const [recentFiles, setRecentFiles] = useState<MyFileRecord[]>([])
  const [isRecentLoading, setIsRecentLoading] = useState(true)
  const { t } = useTranslation("home")

  useEffect(() => {
    let isMounted = true

    const loadRecentFiles = async () => {
      try {
        setIsRecentLoading(true)
        const result = await converterDB.getMyFilesPaged(1, 6, true)
        if (!isMounted) return
        setRecentFiles(result.items as MyFileRecord[])
      } catch (error) {
        console.error("Failed to load recent files:", error)
        if (!isMounted) return
        setRecentFiles([])
      } finally {
        if (!isMounted) return
        setIsRecentLoading(false)
      }
    }

    loadRecentFiles()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="space-y-4">
      {isRecentLoading ? (
        <div className="text-sm text-muted-foreground">{t("recent.loading")}</div>
      ) : recentFiles.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t("recent.empty")}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {recentFiles.map((file) => {
            const metaParts = [
              file.extension?.toUpperCase(),
              typeof file.duration === "number" ? formatDuration(file.duration) : null,
              typeof file.size === "number" ? formatFileSize(file.size) : null,
            ].filter(Boolean)

            return (
              <div key={file.id} className="group flex flex-col">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30 mb-2 shadow-sm transition-shadow hover:shadow-md">
                  <MediaThumbnail
                    path={file.outputPath || file.path}
                    title={file.title}
                    fileType={file.fileType}
                    className="w-full h-full"
                  />
                </div>
                <div className="text-xs text-muted-foreground text-center truncate mb-0.5">
                  {metaParts.join(" · ")}
                </div>
                <div className="text-sm text-foreground truncate text-center">
                  {file.title}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex justify-end">
        <Link
          to="/my/files"
          className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
        >
          {t("recent.viewAll")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
