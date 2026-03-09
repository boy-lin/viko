import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DenoiseFilterConfig } from "@/lib/mediaTaskEvent";
import DenoiseSettingsDialog from "./DenoiseSettingsDialog";
import { useDenoiseStore } from "./store";

export default function EngineSelectorCard() {
  const globalConfig = useDenoiseStore((state) => state.globalConfig);
  const updateGlobalConfig = useDenoiseStore((state) => state.updateGlobalConfig);
  const applyConfigToAllTasks = useDenoiseStore((state) => state.applyConfigToAllTasks);

  const engine = globalConfig.args.engine || "ffmpeg";
  const filter = globalConfig.args.filter || {};

  const applyConfigPatch = (patch: Partial<typeof globalConfig>) => {
    updateGlobalConfig(patch);
    applyConfigToAllTasks({
      ...globalConfig,
      ...patch,
      args: {
        ...globalConfig.args,
        ...(patch.args || {}),
      },
    });
  };

  const handleEngineChange = (value: "ffmpeg" | "ai") => {
    applyConfigPatch({
      args: {
        ...globalConfig.args,
        engine: value,
      },
    });
  };

  const handleFilterChange = (patch: Partial<DenoiseFilterConfig>) => {
    applyConfigPatch({
      args: {
        ...globalConfig.args,
        filter: {
          ...filter,
          ...patch,
        },
      },
    });
  };

  const enabledFilters = Object.entries(filter)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .join("、");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">降噪引擎</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={engine}
          onValueChange={(value) => handleEngineChange(value as "ffmpeg" | "ai")}
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          <Label
            htmlFor="denoise-engine-ffmpeg"
            className="cursor-pointer rounded-lg border border-border p-3 hover:border-primary/60"
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="ffmpeg" id="denoise-engine-ffmpeg" className="mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">FFmpeg 降噪（默认）</p>
                <p className="text-xs text-muted-foreground">
                  适合快速、低资源场景，处理风声、电流声、低频噪声等简单背景噪音。
                </p>
              </div>
            </div>
          </Label>

          <Label
            htmlFor="denoise-engine-ai"
            className="cursor-pointer rounded-lg border border-border p-3 hover:border-primary/60"
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="ai" id="denoise-engine-ai" className="mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">AI 降噪（预留）</p>
                <p className="text-xs text-muted-foreground">
                  适合复杂环境噪声场景，当前版本仅提供入口，具体模型逻辑暂未实现。
                </p>
              </div>
            </div>
          </Label>
        </RadioGroup>

        {engine === "ffmpeg" ? (
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">FFmpeg 降噪策略</p>
              <p className="text-xs text-muted-foreground">
                {enabledFilters ? `当前启用：${enabledFilters}` : "当前启用：全部策略"}
              </p>
            </div>
            <DenoiseSettingsDialog filter={filter} onFilterChange={handleFilterChange} />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
            AI 降噪暂未实现，提交任务会返回提示错误。当前建议使用 FFmpeg 降噪。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
