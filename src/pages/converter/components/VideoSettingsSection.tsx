import { useState } from "react";
import { VideoAdvanceSetting } from "./VideoAdvanceSetting";
import { VideoSimpleSettings } from "./VideoSimpleSettings";
import { ConvertVideoTaskArgs } from "@/lib/bridge";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { formatToDefinition } from "@/data/capabilities";

interface SettingsModeToggleProps {
  openAdvanced: boolean;
  onToggle: (next: boolean) => void;
}

const SettingsModeToggle: React.FC<SettingsModeToggleProps> = ({
  openAdvanced,
  onToggle,
}) => {
  return (
    <div className="flex items-center rounded-full border border-border bg-background text-xs font-medium overflow-hidden">
      <button
        type="button"
        className={`cursor-pointer px-3 py-1 transition-colors ${!openAdvanced ? "bg-muted text-foreground" : "text-muted-foreground"
          }`}
        onClick={() => onToggle(false)}
      >
        简易设置
      </button>
      <button
        type="button"
        className={`cursor-pointer px-3 py-1 transition-colors ${openAdvanced ? "bg-muted text-foreground" : "text-muted-foreground"
          }`}
        onClick={() => onToggle(true)}
      >
        高级设置
      </button>
    </div>
  );
};

export default function VideoSettingsSection({
  config,
  onChange,
}: {
  config: ConvertVideoTaskArgs;
  onChange: (next: Partial<ConvertVideoTaskArgs>) => void;
}) {
  const { t } = useTranslation("converter");
  const [openAdvanced, setOpenAdvanced] = useState(false);


  const onReset = () => {
    if (onChange) {
      if (!config.format) {
        console.error("No format found");
        return;
      }
      const containerDefinition = formatToDefinition.get(config.format);
      const video_encoder = containerDefinition?.video?.defaultEncoder;
      if (!video_encoder) {
        console.error("No default encoder found for container", containerDefinition);
        return;
      }
      onChange({
        video_encoder,
        video_bitrate: undefined,
        resolution: undefined,
        frame_rate: undefined,
      });
    }
  };

  return <>
    <div className="p-3 border-b bg-muted/10 font-medium text-sm flex gap-2 items-center">
      <h3 className="font-bold text-lg">{t("settings.video.title")}</h3>
      <SettingsModeToggle
        openAdvanced={openAdvanced}
        onToggle={setOpenAdvanced}
      />
      <Button className="cursor-pointer" variant="ghost" size="icon" onClick={onReset}>
        <RefreshCw className="w-4 h-4" />
      </Button>
    </div>
    {/*  custom settings body */}
    <div className="flex-1 overflow-hidden p-2">
      {openAdvanced ? (
        <VideoAdvanceSetting
          format={config.format}
          video_encoder={config.video_encoder}
          resolution={config.resolution}
          frame_rate={config.frame_rate}
          video_bitrate={config.video_bitrate}
          onChange={onChange}
        />
      ) : (
        <VideoSimpleSettings
          resolution={config.resolution}
          video_bitrate={config.video_bitrate}
          onChange={onChange}
        />
      )}
    </div>
  </>
}