import { revealItemInDir } from "@/lib/revealItemInDir";
import { Button } from "../ui/button";
import { FolderOpen } from "lucide-react";

export const OpenFolder = ({ path, className }: { path?: string, className?: string }) => {
  const handleOpenFolder = async () => {
    if (!path) return;
    try {
      console.log("Opening folder:", path);
      await revealItemInDir(path);
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };
  return (
    <Button variant="ghost" size="icon" onClick={handleOpenFolder} disabled={!path} className={className}>
      <FolderOpen className="h-4 w-4" />
    </Button>
  );
};
