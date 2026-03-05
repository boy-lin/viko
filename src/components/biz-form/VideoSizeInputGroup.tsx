import { Link2, Link2Off } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import CorrectNumberInput from "@/components/ui-lab/correct-number-input";
import { InputGroup } from "@/components/ui/input-group";

interface VideoSizeInputGroupProps {
  resolution?: string;
  widthPlaceholder?: string;
  heightPlaceholder?: string;
  onChange: (resolution: string) => void;
}

const parseResolution = (value: string | undefined): { width: number; height: number } => {
  if (!value) return { width: 1920, height: 1080 };
  const normalized = value.replace("×", "x");
  const [w, h] = normalized.split("x");
  const width = Number.parseInt(w || "", 10);
  const height = Number.parseInt(h || "", 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1920, height: 1080 };
  }
  return { width, height };
};

export function VideoSizeInputGroup({
  resolution,
  widthPlaceholder,
  heightPlaceholder,
  onChange,
}: VideoSizeInputGroupProps) {
  const [ratioLocked, setRatioLocked] = useState(true);
  const { width, height } = parseResolution(resolution);
  const ratio = height ? width / height : 16 / 9;

  const handleWidthChange = (nextWidth: number) => {
    const safeWidth = Math.max(1, Math.round(nextWidth));
    const nextHeight = ratioLocked
      ? Math.max(1, Math.round(safeWidth / ratio))
      : height;
    onChange(`${safeWidth}x${nextHeight}`);
  };

  const handleHeightChange = (nextHeight: number) => {
    const safeHeight = Math.max(1, Math.round(nextHeight));
    const nextWidth = ratioLocked
      ? Math.max(1, Math.round(safeHeight * ratio))
      : width;
    onChange(`${nextWidth}x${safeHeight}`);
  };

  return (
    <InputGroup className="bg-muted/30 w-auto">
      <CorrectNumberInput
        value={width}
        onChange={handleWidthChange}
        className="w-[6em]"
        placeholder={widthPlaceholder}
      />
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        className="flex items-center justify-center cursor-pointer h-6 w-4 bg-transparent hover:bg-transparent"
        onClick={() => {
          setRatioLocked((v) => !v);
        }}
      >
        {ratioLocked ? (
          <Link2 className="h-4 w-4 text-primary pointer-events-none" />
        ) : (
          <Link2Off className="h-4 w-4 text-muted-foreground pointer-events-none" />
        )}
      </motion.button>
      <CorrectNumberInput
        value={height}
        onChange={handleHeightChange}
        className="w-[6em]"
        placeholder={heightPlaceholder}
      />
    </InputGroup>
  );
}
