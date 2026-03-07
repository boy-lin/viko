import { useState } from "react";
import { VideoAdvanceSetting } from "./VideoAdvanceSetting";
import { VideoSimpleSettings } from "./VideoSimpleSettings";
import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { useTranslation } from "react-i18next";

interface SettingsModeToggleProps {
  openAdvanced: boolean;
  onToggle: (next: boolean) => void;
}

const SettingsModeToggle: React.FC<SettingsModeToggleProps> = ({
  openAdvanced,
  onToggle,
}) => {
  const { t } = useTranslation("task");
  return (
    <div className="flex items-center rounded-full border border-border bg-background text-xs font-medium overflow-hidden">
      <button
        type="button"
        className={`cursor-pointer px-3 py-1 transition-colors ${!openAdvanced ? "bg-muted text-foreground" : "text-muted-foreground"
          }`}
        onClick={() => onToggle(false)}
      >
        {t("bizForm.videoSettings.mode.simple")}
      </button>
      <button
        type="button"
        className={`cursor-pointer px-3 py-1 transition-colors ${openAdvanced ? "bg-muted text-foreground" : "text-muted-foreground"
          }`}
        onClick={() => onToggle(true)}
      >
        {t("bizForm.videoSettings.mode.advanced")}
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
  const [openAdvanced, setOpenAdvanced] = useState(false);

  return <>
    <div className="p-3 flex gap-2 items-center">
      {/* <h3 className="font-bold text-lg">{t("settings.video.title")}</h3> */}
      <SettingsModeToggle
        openAdvanced={openAdvanced}
        onToggle={setOpenAdvanced}
      />
      {/* <Button className="cursor-pointer" variant="ghost" size="icon" onClick={onReset}>
        <RefreshCw className="w-4 h-4" />
      </Button> */}
    </div>
    {/*  custom settings body */}
    <div className="flex-1 min-h-0 overflow-hidden">
      {openAdvanced ? (
        <VideoAdvanceSetting
          format={config.format}
          color_space={config.color_space}
          color_range={config.color_range}
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
          crf={config.crf}
          onChange={onChange}
        />
      )}
    </div>
  </>
}
