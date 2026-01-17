import React from "react";
import { Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormatSelector } from "@/components/biz-form/FormatSelector";
import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";
import { useConverterStore } from "@/stores/converterStore";
import type { FormatSelectorValue } from "@/components/biz-form/FormatSelector";
import { ConversionSettingsDialog } from "./SettingsDialog";
import { converterQueue } from "@/lib/bridge";

export const ConverterFooter: React.FC = () => {
  const globalConfig = useConverterStore((state) => state.globalConfig);
  const tasks = useConverterStore((state) => state.tasks);
  const updateGlobalConfig = useConverterStore(
    (state) => state.updateGlobalConfig
  );

  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  const handleFormatChange = (updates: FormatSelectorValue) => {
    // Update Config
    if (globalConfig) {
      const newConfig = { ...globalConfig };

      // Basic Format
      if (updates.outputFormat) {
        newConfig.outputFormat = updates.outputFormat;
      }

      // Video Config Updates (create if missing)
      if (updates.resolution || updates.videoEncoder) {
        const videoConfig = newConfig.video || {
          encoder: "h264",
          resolution: "1920x1080",
          frameRate: "30",
          bitrate: "1000",
        };
        newConfig.video = {
          ...videoConfig,
          resolution: updates.resolution || videoConfig.resolution,
          encoder: updates.videoEncoder || videoConfig.encoder,
        };
      }

      // Update ALL Audio Tracks
      if (newConfig.audioTracks && newConfig.audioTracks.length > 0) {
        newConfig.audioTracks = newConfig.audioTracks.map((track) => ({
          ...track,
          bitrate: updates.audioBitrate || track.bitrate,
          encoder: updates.audioEncoder || track.encoder,
        }));
      }
      updateGlobalConfig(newConfig);
    }
  };

  const handleConvertAll = () => {
    const pendingTasks = tasks.filter(t => t.status !== 'finished');
    if (pendingTasks.length > 0) {
      converterQueue.add(pendingTasks);
    }
  };

  return (
    <div className="w-full flex items-end justify-between bg-background mt-auto">
      <div className="flex items-center gap-6">
        {/* Convert to Label and Select */}
        <div className="flex flex-col gap-2 items-start">
          <span className="text-sm font-medium text-muted-foreground">
            目标格式
          </span>
          <div className="flex items-center gap-2">
            <FormatSelector
              className="w-[10em]"
              format={globalConfig.outputFormat}
              encoder={globalConfig.video?.encoder}
              resolution={globalConfig.video?.resolution}
              audioBitrate={globalConfig.audioTracks?.[0]?.bitrate}
              onValueChange={handleFormatChange}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Save to Label and Select */}
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            保存到
          </span>
          <div className="flex items-center gap-2">
            <OutputLocationSelect className="w-[10em]" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        <Button
          className="bg-purple-600 hover:bg-purple-700 text-white h-11 px-8 text-base font-semibold shadow-lg shadow-purple-200 dark:shadow-purple-900/20"
          onClick={handleConvertAll}
        >
          Convert All
        </Button>
      </div>

      <ConversionSettingsDialog
        taskConfig={globalConfig}
        onTaskConfigChange={updateGlobalConfig}
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      />
    </div>
  );
};
