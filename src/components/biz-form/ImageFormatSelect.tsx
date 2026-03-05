import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IMAGE_FORMAT_OPTIONS } from "@/data/formats";
import { useTranslation } from "react-i18next";

interface ImageFormatSelectProps {
  value?: string;
  onValueChange: (value?: string) => void;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

export const ImageFormatSelect: React.FC<ImageFormatSelectProps> = ({
  value,
  onValueChange,
  label,
  hideLabel = false,
  className,
}) => {
  const { t } = useTranslation("task");
  const selectValue = value ?? "auto";

  return (
    <div className={className ?? "space-y-2"}>
      {!hideLabel && <Label>{label ?? t("bizForm.imageFormat.label")}</Label>}
      <Select
        value={selectValue}
        onValueChange={(v) => onValueChange(v === "auto" ? undefined : v)}
      >
        <SelectTrigger className="w-full" size="sm">
          <SelectValue placeholder={t("bizForm.imageFormat.keepOriginal")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{t("bizForm.imageFormat.keepOriginal")}</SelectItem>
          {IMAGE_FORMAT_OPTIONS.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
