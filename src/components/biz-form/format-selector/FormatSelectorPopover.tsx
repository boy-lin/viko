import { useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileType } from "@/types/tasks";
import { ConvertVideoTaskArgs } from "@/lib/mediaTaskEvent";
import { FormatGroup } from "@/types/options";

import FormatSelectorContent from "./FormatSelectorContent";
import { FormatSelectorProps } from "./types";
import { useFormatSelectorStore } from "./store";

const EMPTY_RECENTS: FormatGroup[] = [];

export default function FormatSelectorPopover(props: FormatSelectorProps) {
  const {
    config,
    recentKey,
    onValueChange = () => { },
    className,
    applyConfigToAllTasks,
    btnLabelKey = 'common.apply_all'
  } = props;
  const [open, setOpen] = useState(false);
  const formatRecents = useFormatSelectorStore(
    (state) => state.recentsByKey[recentKey] ?? EMPTY_RECENTS
  );
  const addToRecents = useFormatSelectorStore((state) => state.addToRecents);

  const selectedFormat = useMemo(() => {
    let label;
    if (config.activeCategory === FileType.Video) {
      const args = config.args as ConvertVideoTaskArgs;
      label = `${args?.resolution ? `(${args?.resolution})` : "Auto"}`;
    } else if (config.activeCategory === FileType.Audio) {
      // const _args = config.args as ConvertAudioTaskArgs;
      // label = "";
    }
    return {
      extension: config.args.format,
      label,
    };
  }, [config.args, config.activeCategory]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("cursor-pointer justify-between", className)}
        >
          {selectedFormat ? (
            <span className="flex items-center gap-1 truncate">
              <span className="font-semibold w-[3em]">
                {selectedFormat.extension?.toUpperCase()}
              </span>
              <span className="text-xs w-[6em]">
                {selectedFormat.label}
              </span>
            </span>
          ) : (
            "Select format..."
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[680px] p-0" align="start">
        <FormatSelectorContent
          config={config}
          formatRecents={formatRecents}
          addToRecents={(format) => addToRecents(recentKey, format)}
          onValueChange={onValueChange}
          applyConfigToAllTasks={applyConfigToAllTasks ?? (() => { })}
          onClose={() => setOpen(false)}
          btnLabelKey={btnLabelKey}
        />
      </PopoverContent>
    </Popover>
  );
}
