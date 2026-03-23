import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { FileType } from "@/types/tasks";

import { useCompressorStore } from "./store";
import { buildTaskDefaultsFromDetails, buildTaskArgsFromGlobalConfig } from "./taskDefaults";

export default function CompressorFooter() {
  const { t } = useTranslation("task");
  const tasks = useCompressorStore((state) => state.tasks);
  const globalConfig = useCompressorStore((state) => state.globalConfig);
  const updateGlobalConfig = useCompressorStore((state) => state.updateGlobalConfig);
  const updateTaskById = useCompressorStore((state) => state.updateTaskById);

  const sliderValue = useMemo(() => {
    if (tasks.some((task) => task.fileType === FileType.Image || task.fileType === FileType.Gif)) {
      return globalConfig.args.quality ?? globalConfig.args.ratio ?? 50;
    }
    return globalConfig.args.ratio ?? 50;
  }, [globalConfig.args.quality, globalConfig.args.ratio, tasks]);

  const applyGlobalValue = (value: number) => {
    updateGlobalConfig({
      args: {
        ratio: value,
        quality: value,
      },
    });

    const store = useCompressorStore.getState();
    store.tasks.forEach((task) => {
      const withGlobalArgs = {
        ...task,
        ...buildTaskArgsFromGlobalConfig(task, {
          args: { ratio: value, quality: value },
        }),
      };

      if (task.mediaDetails) {
        store.updateTaskById(
          task.id,
          buildTaskDefaultsFromDetails(withGlobalArgs, task.mediaDetails),
        );
      } else {
        updateTaskById(task.id, buildTaskArgsFromGlobalConfig(task, {
          args: { ratio: value, quality: value },
        }));
      }
    });
  };

  return (
    <div className="mt-auto flex w-full items-end justify-between bg-background">
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t("footer.quality")}
          </span>
          <div className="w-[10em]">
            <Slider
              value={[sliderValue]}
              onValueChange={(values) => applyGlobalValue(values[0])}
              min={10}
              max={100}
              step={5}
              className="w-full cursor-pointer"
            />
          </div>
        </div>

        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t("footer.save_to")}
          </span>
          <OutputLocationSelect className="w-[14em]" />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <Button
          className="h-11 px-8 text-base font-semibold shadow cursor-pointer"
          onClick={() => {
            void (async () => {
              try {
                await useCompressorStore.getState().pushTasksToQueue();
              } catch (error) {
                toast.error(t("footer.compress_all"));
                console.error("Failed to compress all media:", error);
              }
            })();
          }}
        >
          {t("footer.compress_all")}
        </Button>
      </div>
    </div>
  );
}
