import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ResolutionSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
}

export function ResolutionSelect({
  value,
  onValueChange,
  id = "resolution",
}: ResolutionSelectProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Resolution</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="None (Auto)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="3840x2160">3840x2160 (4K)</SelectItem>
          <SelectItem value="2560x1440">2560x1440 (2K)</SelectItem>
          <SelectItem value="1920x1080">1920x1080 (Full HD)</SelectItem>
          <SelectItem value="1280x720">1280x720 (HD)</SelectItem>
          <SelectItem value="854x480">854x480 (SD)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
