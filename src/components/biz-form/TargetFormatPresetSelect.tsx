import React from "react";
import { FormatSelector } from "./FormatSelector";

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
  return (
    <FormatSelector
      value={value}
      onValueChange={onValueChange || (() => { })}
      className={className}
    />
  );
};
