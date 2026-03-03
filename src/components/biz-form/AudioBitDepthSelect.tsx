import React, { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { BadgeQuestionMark } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
const DEFAULT_BIT_DEPTH_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "16", label: "16-bit" },
  { value: "24", label: "24-bit" },
  { value: "32", label: "32-bit" },
];

interface AudioBitDepthSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  allowedBitDepths?: number[];
  autoLabel?: string;
  placeholder?: string;
  label?: string;
  helpText?: string;
  hideLabel?: boolean;
  className?: string;
}

const DEFAULT_LABEL = "位深";
const BIT_DEPTH_HELP = "控制每个采样的精度。更高位深有利于动态范围与细节保留，但体积通常更高。";

export const AudioBitDepthSelect: React.FC<AudioBitDepthSelectProps> = ({
  value,
  onValueChange,
  allowedBitDepths,
  autoLabel,
  placeholder,
  label,
  helpText,
  hideLabel = false,
  className,
}) => {
  const bitDepthOptions = useMemo(() => {
    if (!allowedBitDepths || allowedBitDepths.length === 0) {
      return [
        { ...DEFAULT_BIT_DEPTH_OPTIONS[0], label: autoLabel ?? "Auto" },
        ...DEFAULT_BIT_DEPTH_OPTIONS.slice(1),
      ];
    }
    const sorted = [...allowedBitDepths]
      .filter((bitDepth) => Number.isFinite(bitDepth) && bitDepth > 0)
      .sort((left, right) => left - right);
    return [
      { value: "auto", label: autoLabel ?? "Auto" },
      ...sorted.map((bitDepth) => ({
        value: String(bitDepth),
        label: `${bitDepth}-bit`,
      })),
    ];
  }, [allowedBitDepths, autoLabel]);

  useEffect(() => {
    if (!bitDepthOptions.length) return;
    if (!bitDepthOptions.some((option) => option.value === value)) {
      onValueChange(bitDepthOptions[0].value);
    }
  }, [bitDepthOptions, onValueChange, value]);

  const placeholderText = placeholder ?? "Select bit depth";

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-1">
          <Label>{label ?? DEFAULT_LABEL}</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? BIT_DEPTH_HELP}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <Select value={value ?? "auto"} onValueChange={onValueChange}>
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholderText} />
        </SelectTrigger>
        <SelectContent>
          {bitDepthOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
