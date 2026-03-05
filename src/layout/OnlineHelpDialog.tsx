import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { bridge } from "@/lib/bridge";
import { revealItemInDir } from "@/lib/revealItemInDir";
import { Download, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function OnlineHelpDialog() {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportLogs = async () => {
    if (exporting) return;
    try {
      setExporting(true);
      const zipPath = await bridge.exportLogsArchive();
      toast.success(t("help.exportSuccess"));
      await revealItemInDir(zipPath);
    } catch (error) {
      toast.error(t("help.exportFailed"));
      console.error("Export logs failed:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="shadow-none cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <MessageSquare className="w-4 h-4" />
        {t("help.button")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("help.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>{t("help.description")}</p>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div>
                X:{" "}
                <a
                  className="text-primary hover:underline"
                  href="https://x.com/evilHolly1"
                  target="_blank"
                  rel="noreferrer"
                >
                  https://x.com/evilHolly1
                </a>
              </div>
              <div>
                Email:{" "}
                <a
                  className="text-primary hover:underline"
                  href="mailto:xiaoyaosha@gmail.com"
                >
                  xiaoyaosha@gmail.com
                </a>
              </div>
              <div>Telegram: @HollyWWH</div>
              <div>小红书账号/昵称: 5729257995/赛亚人86</div>
            </div>

            <Button
              variant="outline"
              className="w-full cursor-pointer"
              onClick={handleExportLogs}
              disabled={exporting}
            >
              <Download className="w-4 h-4 mr-2" />
              {exporting ? t("help.exporting") : t("help.exportLogs")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
