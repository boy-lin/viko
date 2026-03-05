import { useCallback, useState } from "react";
import { MoreVertical, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { bridge } from "@/lib/bridge";
import { useTranslation } from "react-i18next";

type UploadButtonProps = {
  name: string;
  multiple: boolean;
  extensions: string[];
  onAddPaths: (paths: string[]) => void;
};

export function UploadButton({ name, multiple, extensions, onAddPaths }: UploadButtonProps) {
  const { t } = useTranslation("task");
  const [loading, setLoading] = useState(false);

  const addFiles = useCallback(async () => {
    try {
      setLoading(true);
      const paths = await bridge.addFilesOrFolders({
        name,
        multiple,
        extensions,
      });
      onAddPaths(paths);
    } finally {
      setLoading(false);
    }

  }, [name, multiple, extensions, onAddPaths]);

  const addFolder = useCallback(async () => {
    try {
      const paths = await bridge.addFilesOrFolders({
        name,
        multiple,
        extensions,
        directory: true,
      });
      onAddPaths(paths);
    } finally {
      setLoading(false);
    }
  }, [name, multiple, extensions, onAddPaths]);

  return (
    <ButtonGroup className="flex items-center">
      <Button className="cursor-pointer flex items-center gap-2" size="sm" onClick={addFiles} disabled={loading}>
        {
          loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Plus className="h-4 w-4" />
        }
        {t("search.add_files")}
      </Button>
      <HoverCard openDelay={120} closeDelay={80}>
        <HoverCardTrigger asChild>
          <button className="rounded-r-md bg-primary text-primary-foreground h-8 w-auto px-1 border-primary b">
            <MoreVertical className="h-4 w-4" />
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="end" className="w-36 p-1">
          <button
            type="button"
            className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={addFiles}
            disabled={loading}
          >
            {t("search.add_files")}
          </button>
          <button
            type="button"
            className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
            onClick={addFolder}
            disabled={loading}
          >
            {t("search.add_folders", "Add Folder")}
          </button>
        </HoverCardContent>
      </HoverCard>

    </ButtonGroup >
  );
}

