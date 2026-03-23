import { startTransition, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UploadButton } from "@/components/ui-biz/UploadButton";
import { CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { SUPPORT_FORMATS } from "@/data/formats";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";

import { CONVERTER_UPLOAD_LABEL } from "./constants";
import { useConverterStore } from "./store";

interface ConverterHeaderProps {
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
}

export default function ConverterHeader({
  globalFilter,
  onGlobalFilterChange,
}: ConverterHeaderProps) {
  const { t } = useTranslation("common");
  const { t: tt } = useTranslation("task");
  const clearTasks = useConverterStore((state) => state.clearTasks);
  const [isDeletePopoverOpen, setIsDeletePopoverOpen] = useState(false);

  const handleDelete = async () => {
    const hasRunningTasks = await getMediaTaskQueue().hasRunningTasksByType();

    if (!hasRunningTasks) {
      await clearTasks();
      await getMediaTaskQueue().clearQueueByType(true);
      return;
    }

    setIsDeletePopoverOpen(true);
  };

  return (
    <CardDescription className="flex flex-col items-center gap-4 md:flex-row">
      <div className="relative w-full md:w-72">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("search.placeholder")}
          className="pl-9"
          value={globalFilter}
          onChange={(e) => {
            const value = e.target.value;
            startTransition(() => onGlobalFilterChange(value));
          }}
        />
      </div>
      <UploadButton
        name={CONVERTER_UPLOAD_LABEL}
        multiple={true}
        extensions={SUPPORT_FORMATS}
        onAddPaths={(paths) => useConverterStore.getState().addTasksByPaths(paths)}
      />
      <Popover
        open={isDeletePopoverOpen}
        onOpenChange={setIsDeletePopoverOpen}
      >
        <PopoverAnchor asChild>
          <Button
            variant="outline"
            size="icon"
            className="cursor-pointer border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600"
            onClick={() => {
              void handleDelete();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </PopoverAnchor>
        <PopoverContent className="w-64" align="end">
          <div className="space-y-3">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold">
                {tt("footer.confirm_delete_title")}
              </h4>
              <p className="text-xs text-muted-foreground">
                {tt("footer.confirm_delete_desc")}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDeletePopoverOpen(false)}
              >
                {tt("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  void (async () => {
                    await getMediaTaskQueue().clearQueueByType(true);
                    clearTasks();
                    setIsDeletePopoverOpen(false);
                  })();
                }}
              >
                {tt("footer.confirm_delete")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </CardDescription>
  );
}
