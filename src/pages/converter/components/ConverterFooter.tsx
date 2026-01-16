import React from "react";
import { Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormatSelector } from "@/components/biz-form/FormatSelector";
import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";
import { useConverterStore } from "@/stores/converterStore";
import type { FormatSelectorValue } from "@/components/biz-form/FormatSelector";
import { ConversionSettingsDialog } from "./ConversionSettingsDialog";

export const ConverterFooter: React.FC = () => {
  const globalConfig = useConverterStore((state) => state.globalConfig);
  const updateGlobalConfig = useConverterStore((state) => state.updateGlobalConfig);

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
          encoder: 'h264',
          resolution: '1920x1080',
          frameRate: '30',
          bitrate: '1000',
        };
        newConfig.video = {
          ...videoConfig,
          resolution: updates.resolution || videoConfig.resolution,
          encoder: updates.videoEncoder || videoConfig.encoder,
        };
      }

      // Update ALL Audio Tracks
      if (newConfig.audioTracks && newConfig.audioTracks.length > 0) {

        newConfig.audioTracks = newConfig.audioTracks.map(track => ({
          ...track,
          bitrate: updates.audioBitrate || track.bitrate,
          encoder: updates.audioEncoder || track.encoder,
        }));
      }
      updateGlobalConfig(newConfig);
    }
  }

  return (
    <div className="flex items-center justify-between p-4 bg-background border-t border-border mt-auto">
      <div className="flex items-center gap-6">
        {/* Convert to Label and Select */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Convert to</span>
          <div className="flex items-center gap-2">
            <FormatSelector
              format={globalConfig.outputFormat}
              encoder={globalConfig.video?.encoder}
              resolution={globalConfig.video?.resolution}
              audioBitrate={globalConfig.audioTracks?.[0]?.bitrate}
              onValueChange={handleFormatChange}
            />
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsSettingsOpen(true)}>
              <Settings className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Save to Label and Select */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Save to</span>
          <div className="flex items-center gap-2">
            <OutputLocationSelect />
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

        <Button className="bg-purple-600 hover:bg-purple-700 text-white h-11 px-8 text-base font-semibold shadow-lg shadow-purple-200 dark:shadow-purple-900/20">
          <span className="mr-2">🔄</span> Convert All
        </Button>
      </div>

      {/* <ConversionSettingsDialog
        task={task}
        taskConfig={task.config}
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      /> */}
    </div>
  );
};
