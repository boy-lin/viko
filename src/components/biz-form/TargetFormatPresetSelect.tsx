import React from "react";
import { FormatSelector, FormatSelectorValue } from "./FormatSelector";

interface TargetFormatPresetSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

export const TargetFormatPresetSelect: React.FC<TargetFormatPresetSelectProps> = ({
  value = "mp4-sd",
  onValueChange,
  className,
}) => {
  const handleValueChange = (updates: FormatSelectorValue) => {
    if (onValueChange) {
      // Extract the format value from updates
      onValueChange(updates.outputFormat);
    }
  };

  return (
    <FormatSelector
      format={value}
      formatType="video"
      onValueChange={handleValueChange}
      className={className}
    />
  );
};
