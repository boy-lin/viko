import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, Gauge } from "lucide-react";
import { ResolutionSelect } from "@/components/ResolutionSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";

interface CommonSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

const OutputFormatSelect = ({
  value,
  onValueChange,
  disabled,
}: CommonSelectProps) => {
  return (
    <div className="space-y-2">
      <Label htmlFor="output-format">Output Format</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id="output-format">
          <SelectValue placeholder="None (Auto)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mp4">MP4</SelectItem>
          <SelectItem value="avi">AVI</SelectItem>
          <SelectItem value="mov">MOV</SelectItem>
          <SelectItem value="mkv">MKV</SelectItem>
          <SelectItem value="webm">WebM</SelectItem>
          <SelectItem value="flv">FLV</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

const VideoCodecSelect = ({
  value,
  onValueChange,
  disabled,
}: CommonSelectProps) => {
  return (
    <div className="space-y-2">
      <Label htmlFor="codec">Video Codec</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id="codec">
          <SelectValue placeholder="None (Auto)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="h264">H.264</SelectItem>
          <SelectItem value="h265">H.265 (HEVC)</SelectItem>
          <SelectItem value="vp9">VP9</SelectItem>
          <SelectItem value="av1">AV1</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

const BitrateSelect = ({
  value,
  onValueChange,
  disabled,
}: CommonSelectProps) => {
  return (
    <div className="space-y-2">
      <Label htmlFor="bitrate">Bitrate (kbps)</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id="bitrate">
          <SelectValue placeholder="None (Auto)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="2000">2000 kbps</SelectItem>
          <SelectItem value="5000">5000 kbps</SelectItem>
          <SelectItem value="8000">8000 kbps</SelectItem>
          <SelectItem value="12000">12000 kbps</SelectItem>
          <SelectItem value="20000">20000 kbps</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

const FrameRateSelect = ({
  value,
  onValueChange,
  disabled,
}: CommonSelectProps) => {
  return (
    <div className="space-y-2">
      <Label htmlFor="framerate">Frame Rate</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id="framerate">
          <SelectValue placeholder="None (Auto)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="24">24 fps</SelectItem>
          <SelectItem value="30">30 fps</SelectItem>
          <SelectItem value="60">60 fps</SelectItem>
          <SelectItem value="120">120 fps</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

interface TranscodeConfigFormProps {
  title?: string;
  renderRight?: () => React.ReactNode;
  outputFormat: string;
  onOutputFormatChange: (value: string) => void;
  codec: string;
  onCodecChange: (value: string) => void;
  resolution: string;
  onResolutionChange: (value: string) => void;
  bitrate: string;
  onBitrateChange: (value: string) => void;
  framerate: string;
  onFramerateChange: (value: string) => void;
  outputName?: string;
  onOutputNameChange?: (value: string) => void;
  showOutputName?: boolean;
  outputDir: string;
  onOutputDirChange: (value: string) => void;
  disabled?: boolean;
  bodyClassNames?: string;
}

export function TranscodeConfigForm({
  title = "Transcoding Parameters",
  renderRight,
  outputFormat,
  onOutputFormatChange,
  codec,
  onCodecChange,
  resolution,
  onResolutionChange,
  bitrate,
  onBitrateChange,
  framerate,
  onFramerateChange,
  outputName,
  onOutputNameChange,
  showOutputName = true,
  outputDir,
  onOutputDirChange,
  disabled,
  bodyClassNames,
}: TranscodeConfigFormProps) {
  const handleSelectOutputDir = async () => {
    try {
      const selectedDir = await open({
        multiple: false,
        directory: true,
      });
      if (selectedDir) {
        onOutputDirChange?.(selectedDir);
      }
    } catch (e: any) {
      console.error("选择文件夹失败:", e);
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur p-6">
      <h3 className="mb-4 flex justify-between">
        <div className="text-xl font-semibold flex items-center gap-2">
          <Gauge className="w-5 h-5 text-primary" />
          {title}
        </div>
        {renderRight?.()}
      </h3>
      <div className={cn("space-y-4", bodyClassNames)}>
        <OutputFormatSelect
          value={outputFormat}
          onValueChange={onOutputFormatChange}
          disabled={disabled}
        />

        <VideoCodecSelect
          value={codec}
          onValueChange={onCodecChange}
          disabled={disabled}
        />

        <ResolutionSelect
          value={resolution}
          onValueChange={onResolutionChange}
        />

        <BitrateSelect
          value={bitrate}
          onValueChange={onBitrateChange}
          disabled={disabled}
        />

        <FrameRateSelect
          value={framerate}
          onValueChange={onFramerateChange}
          disabled={disabled}
        />

        {showOutputName && onOutputNameChange && (
          <div className="space-y-2">
            <Label htmlFor="output-name">Output File Name</Label>
            <Input
              id="output-name"
              value={outputName}
              onChange={(e) => onOutputNameChange(e.target.value)}
              placeholder="output"
              disabled={disabled}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="output-dir">Output Directory</Label>
          <div className="flex gap-2">
            <Input
              id="output-dir"
              value={outputDir}
              onChange={(e) => onOutputDirChange(e.target.value)}
              className="flex-1"
              disabled={disabled}
            />
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={handleSelectOutputDir}
              disabled={disabled || !handleSelectOutputDir}
            >
              <FolderOpen className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
