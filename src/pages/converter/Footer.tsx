import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FormatSelector } from "@/components/biz-form/FormatSelector";
import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";
import { Button } from "@/components/ui/button";

import { useConverterStore } from "./store";

export default function ConverterFooter() {
  const { t } = useTranslation("task");
  const globalConfig = useConverterStore((state) => state.globalConfig);
  const updateGlobalConfig = useConverterStore((state) => state.updateGlobalConfig);
  const applyConfigToAllTasks = useConverterStore(
    (state) => state.applyConfigToAllTasks,
  );

  return (
    <div className="mt-auto flex w-full items-end justify-between bg-background">
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {t("footer.target_format")}
          </span>
          <FormatSelector
            config={globalConfig}
            recentKey="converter-footer"
            onValueChange={updateGlobalConfig}
            applyConfigToAllTasks={applyConfigToAllTasks}
            btnLabel={t("footer.apply_all")}
          />
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
          className="h-11 cursor-pointer px-8 text-base font-semibold shadow"
          onClick={() => {
            void (async () => {
              try {
                await useConverterStore.getState().pushTasksToQueue();
              } catch (error) {
                toast.error(t("footer.convert_all_failed_video"));
                console.error("Failed to convert media:", error);
              }
            })();
          }}
        >
          {t("footer.convert_all")}
        </Button>
      </div>
    </div>
  );
}
