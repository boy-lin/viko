import React from "react";
import { FormatSelector, FormatSelectorValue } from "./FormatSelector";

interface TargetFormatPresetSelectProps {
  value?: string;
  onValueChange?: (formatType: string, updates: FormatSelectorValue) => void;
  className?: string;
}

export const TargetFormatPresetSelect: React.FC<TargetFormatPresetSelectProps> = ({
  value = "mp4-sd",
  onValueChange,
  className,
}) => {
  const handleValueChange = (formatType: string, updates: FormatSelectorValue) => {
    if (onValueChange) {
      // Extract the format value from updates
      onValueChange(formatType, updates);
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
