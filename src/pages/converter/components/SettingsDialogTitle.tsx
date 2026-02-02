import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SettingsDialogTitleProps {
  title: string;
  onTitleChange: (title: string) => void;
}

export const SettingsDialogTitle: React.FC<SettingsDialogTitleProps> = ({
  title,
  onTitleChange,
}) => {
  const { t } = useTranslation("converter");
  return (
    <div className="flex-1 flex items-center gap-2 mr-8">
      <Label htmlFor="title" className="shrink-0 text-muted-foreground">
        {t("settings.titleLabel")}
      </Label>
      <div className="relative flex-1">
        <Input
          id="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="h-8 border-purple-500 ring-1 ring-purple-500/20"
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => onTitleChange("")}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};
