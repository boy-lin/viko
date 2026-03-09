import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Settings } from "lucide-react";
import { DenoiseFilterConfig } from "@/lib/mediaTaskEvent";
import { useTranslation } from "react-i18next";

const CONTROL_ITEMS: Array<{
  key: keyof DenoiseFilterConfig;
  labelKey: string;
  descKey: string;
}> = [
  {
    key: "remove_low",
    labelKey: "denoise.controls.remove_low.label",
    descKey: "denoise.controls.remove_low.desc",
  },
  {
    key: "remove_high",
    labelKey: "denoise.controls.remove_high.label",
    descKey: "denoise.controls.remove_high.desc",
  },
  {
    key: "fft_denoise",
    labelKey: "denoise.controls.fft_denoise.label",
    descKey: "denoise.controls.fft_denoise.desc",
  },
  {
    key: "noise_gate",
    labelKey: "denoise.controls.noise_gate.label",
    descKey: "denoise.controls.noise_gate.desc",
  },
];

const NUMBER_FIELDS: Array<{
  key: keyof DenoiseFilterConfig;
  labelKey: string;
  placeholder: string;
}> = [
  { key: "low_cutoff_hz", labelKey: "denoise.fields.low_cutoff_hz", placeholder: "120" },
  { key: "high_cutoff_hz", labelKey: "denoise.fields.high_cutoff_hz", placeholder: "8000" },
  { key: "fft_nr", labelKey: "denoise.fields.fft_nr", placeholder: "12" },
  { key: "fft_nf", labelKey: "denoise.fields.fft_nf", placeholder: "-25" },
  { key: "gate_threshold", labelKey: "denoise.fields.gate_threshold", placeholder: "0.015" },
];

interface DenoiseSettingsDialogProps {
  filter: DenoiseFilterConfig;
  onFilterChange: (patch: Partial<DenoiseFilterConfig>) => void;
  showFooter?: boolean;
  onSave?: (filter: DenoiseFilterConfig) => void;
}

export default function DenoiseSettingsDialog({
  filter,
  onFilterChange,
  showFooter = false,
  onSave,
}: DenoiseSettingsDialogProps) {
  const { t } = useTranslation("task");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <Settings className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0">
          <ScrollArea className="max-h-[80vh] p-4">
            <DialogHeader className="space-y-1 pb-2">
              <DialogTitle>{t("denoise.settings_title")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {CONTROL_ITEMS.map((item) => (
                <Label
                  key={item.key}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{t(item.labelKey)}</p>
                    <p className="text-xs text-muted-foreground">{t(item.descKey)}</p>
                  </div>
                  <Switch
                    checked={Boolean(filter[item.key] ?? true)}
                    onChange={(event) => {
                      onFilterChange({ [item.key]: event.currentTarget.checked } as Partial<DenoiseFilterConfig>)
                    }}
                  />
                </Label>
              ))}
            </div>
            <div className="border-t border-border/60 my-3" />
            <div className="grid grid-cols-1 gap-3">
              {NUMBER_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs uppercase text-muted-foreground">{t(field.labelKey)}</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder={field.placeholder}
                    value={
                      filter[field.key] !== undefined ? String(filter[field.key]) : ""
                    }
                    onChange={(event) =>
                      onFilterChange({
                        [field.key]:
                          event.target.value.trim() === ""
                            ? undefined
                            : Number(event.target.value),
                      } as Partial<DenoiseFilterConfig>)
                    }
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
          {
            showFooter && (
              <DialogFooter className="flex flex-row items-center justify-between space-y-0 pt-0 pb-4 px-4">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t("settings.actions.close")}
                </Button>
                <Button onClick={() => {
                  onSave?.(filter);
                  setOpen(false);
                }}>{t("settings.actions.save")}</Button>
              </DialogFooter>
            )
          }
        </DialogContent>
       
      </Dialog>
    </>
  );
}
