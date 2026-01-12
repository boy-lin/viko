import React from "react";
import { FolderOpen, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TargetFormatPresetSelect } from "@/components/biz-form/TargetFormatPresetSelect";
import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";

export const ConverterFooter: React.FC = () => {
  return (
    <div className="flex items-center justify-between p-4 bg-background border-t border-border mt-auto">
      <div className="flex items-center gap-6">
        {/* Convert to Label and Select */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Convert to</span>
          <div className="flex items-center gap-2">
            <TargetFormatPresetSelect />
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Settings className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Save to Label and Select */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Save to</span>
          <div className="flex items-center gap-2">
            <OutputLocationSelect />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Label htmlFor="merge-all" className="text-sm font-medium text-muted-foreground">Merge All</Label>
          <Switch id="merge-all" />
        </div>

        <Button className="bg-purple-600 hover:bg-purple-700 text-white h-11 px-8 text-base font-semibold shadow-lg shadow-purple-200 dark:shadow-purple-900/20">
          <span className="mr-2">🔄</span> Convert All
        </Button>
      </div>
    </div>
  );
};
