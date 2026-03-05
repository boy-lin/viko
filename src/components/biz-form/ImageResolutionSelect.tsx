import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { RESOLUTION_OPTIONS, ResolutionGroup } from "@/data/resolution";
import { cn } from "@/lib/utils";
import { Label } from "@radix-ui/react-label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BadgeQuestionMark } from "lucide-react";
import { ConvertImageTaskArgs } from "@/lib/mediaTaskEvent";
import { useTranslation } from "react-i18next";

interface ImageResolutionSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  groups?: ResolutionGroup[];
  className?: string;
  label?: string;
  placeholder?: string;
  helpText?: string;
}

type ConvertImageCommonArgs = Pick<
  ConvertImageTaskArgs,
  | "task_id"
  | "input_path"
  | "input_file_type"
  | "output_path"
  | "format"
  | "image_encoder"
  | "width"
  | "height"
  | "watermark"
>;

export const IMAGE_CONVERT_COMMON_PARAMS: ReadonlyArray<keyof ConvertImageCommonArgs> = [
  "task_id",
  "input_path",
  "input_file_type",
  "output_path",
  "format",
  "image_encoder",
  "width",
  "height",
  "watermark",
];

export const ImageResolutionSelect: React.FC<ImageResolutionSelectProps> = ({
  value,
  onValueChange,
  groups = RESOLUTION_OPTIONS,
  className,
  label,
  placeholder = "Select resolution",
  helpText,
}) => {
  const { t } = useTranslation("task");
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        <Label className="text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <BadgeQuestionMark className="h-4 w-4 cursor-help text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 whitespace-normal break-words">
              {helpText ?? t("bizForm.imageResolution.help")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Select value={value || "auto"} onValueChange={onValueChange}>
        <SelectTrigger className={cn("w-full cursor-pointer", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {
            groups.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          }
        </SelectContent>
      </Select>
    </div>

  );
};
