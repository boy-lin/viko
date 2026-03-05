import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIDEO_FORMAT_OPTIONS } from "@/data/formats";
import { FormatEnum } from "@/types/options";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface VideoFormatSelectorProps {
  value: FormatEnum;
  onValueChange: (value?: FormatEnum) => void;
  placeholder?: string;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const VideoFormatSelector: React.FC<VideoFormatSelectorProps> = ({
  value,
  onValueChange,
  placeholder,
  label,
  hideLabel = false,
  className,
}) => {
  const { t } = useTranslation("task");
  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && <Label>{label ?? t("bizForm.videoFormat.label")}</Label>}
      <Select
        value={value}
        onValueChange={(next) => onValueChange(next as FormatEnum)}
      >
        <SelectTrigger className="cursor-pointer w-full">
          <SelectValue placeholder={placeholder ?? t("bizForm.videoFormat.placeholder")} />
        </SelectTrigger>
        <SelectContent>
          {VIDEO_FORMAT_OPTIONS.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
