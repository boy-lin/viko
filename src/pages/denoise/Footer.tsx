import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";
import { useDenoiseStore } from "./store";
import { getMediaTaskQueue } from "@/lib/mediaTaskQueue";
import { MediaTaskType } from "@/types/tasks";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import DenoiseSettingsDialog from "./DenoiseSettingsDialog";
import { DenoiseFilterConfig, DenoiseTaskArgs } from "@/lib/mediaTaskEvent";

export const DenoiseFooter: React.FC = () => {
  const { t } = useTranslation("task");
  const clearTasks = useDenoiseStore((state) => state.clearTasks);
  const [isDeletePopoverOpen, setIsDeletePopoverOpen] = useState(false);

  const handleDenoiseAll = async () => {
    try {
      await useDenoiseStore.getState().pushTasksToQueue();
    } catch (error) {
      toast.error(t("denoise.footer.denoise_all_failed"));
      console.error("Failed to denoise media:", error);
    }
  };

  const handleDelete = async () => {
    const hasRunningTasks = await getMediaTaskQueue().hasRunningTasksByType(
      MediaTaskType.ConvertDenoise,
    );

    if (!hasRunningTasks) {
      await clearTasks();
      await getMediaTaskQueue().clearQueueByType(true, MediaTaskType.ConvertDenoise);
    } else {
      setIsDeletePopoverOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    await getMediaTaskQueue().clearQueueByType(true, MediaTaskType.ConvertDenoise);
    await clearTasks();
    setIsDeletePopoverOpen(false);
  };

  const updateGlobalConfig = useDenoiseStore((state) => state.updateGlobalConfig);
  const applyConfigToAllTasks = useDenoiseStore((state) => state.applyConfigToAllTasks);
  const globalConfig = useDenoiseStore((state) => state.globalConfig);

  const handleFilterChange = (patch: Partial<DenoiseTaskArgs["filter"]>) => {
    const patchConfig = {
      args: {
        ...globalConfig.args,
        filter: {
          ...(globalConfig.args.filter || {}),
          ...patch,
        },
      },
    };
    updateGlobalConfig(patchConfig);
   
  };

  const handleSaveConfig = (filter: DenoiseFilterConfig) => {
    applyConfigToAllTasks({
      ...globalConfig,
      args: {
        ...(globalConfig.args || {}),
        filter: {
          ...(globalConfig.args?.filter || {}),
          ...filter,
        },
      },
    });
  };

  return (
    <div className="mt-auto flex w-full items-end justify-between bg-background">
      <div className="flex flex-col items-start gap-2">
        <span className="text-sm font-medium text-muted-foreground">{t("denoise.settings_title")}</span>
        <div className="flex items-center gap-2">
          <DenoiseSettingsDialog
            filter={globalConfig.args.filter || {}}
            onFilterChange={handleFilterChange}
            showFooter={true}
            onSave={handleSaveConfig}
          />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-muted-foreground">{t("footer.save_to")}</span>
          <div className="flex items-center gap-2">
            <OutputLocationSelect className="w-[14em]" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Popover open={isDeletePopoverOpen} onOpenChange={setIsDeletePopoverOpen}>
            <PopoverAnchor asChild>
              <Button
                variant="outline"
                size="icon"
                className="cursor-pointer border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </PopoverAnchor>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">{t("footer.confirm_delete_title")}</h4>
                  <p className="text-xs text-muted-foreground">{t("footer.confirm_delete_desc")}</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsDeletePopoverOpen(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleConfirmDelete}>
                    {t("footer.confirm_delete")}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Button
          className="h-11 cursor-pointer px-8 text-base font-semibold shadow"
          onClick={handleDenoiseAll}
        >
          {t("denoise.footer.start_denoise")}
        </Button>
      </div>
    </div>
  );
};
