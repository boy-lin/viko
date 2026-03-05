import { useState } from "react";
import { Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormatGroup } from "@/types/options";

import FormatSelectorContent from "./FormatSelectorContent";
import { FormatSelectorProps } from "./types";
import { useFormatSelectorStore } from "./store";
import { useTranslation } from "react-i18next";

const EMPTY_RECENTS: FormatGroup[] = [];

export default function FormatSelectorDialog(props: FormatSelectorProps) {
  const { t } = useTranslation("task");
  const {
    config,
    recentKey,
    onValueChange = () => { },
    className,
    applyConfigToAllTasks,
  } = props;
  const [open, setOpen] = useState(false);
  const formatRecents = useFormatSelectorStore(
    (state) => state.recentsByKey[recentKey] ?? EMPTY_RECENTS
  );
  const addToRecents = useFormatSelectorStore((state) => state.addToRecents);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-expanded={open}
          className={cn("cursor-pointer flex items-center justify-center", className)}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="p-0 sm:max-w-[72vw]" showCloseButton={true}>
        <DialogHeader className="sr-only">
          <DialogTitle>{t("bizForm.formatSelector.title")}</DialogTitle>
        </DialogHeader>
        <FormatSelectorContent
          config={config}
          formatRecents={formatRecents}
          addToRecents={(format) => addToRecents(recentKey, format)}
          onValueChange={onValueChange}
          applyConfigToAllTasks={applyConfigToAllTasks ?? (() => { })}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
