import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { EllipsisName } from "@/components/ui-lab/ellipsis-name";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface OutputTitleEditorProps {
  value?: string;
  placeholder?: string;
  className?: string;
  onChange: (next: string) => void;
}

export default function OutputTitleEditor({
  value,
  placeholder,
  className,
  onChange,
}: OutputTitleEditorProps) {
  const { t } = useTranslation("task");
  const fallbackPlaceholder = placeholder ?? t("bizForm.outputTitle.unnamed");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value || "");
    }
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== (value || "")) {
      onChange(next);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={cn(
          "h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm outline-none focus:border-primary",
          className
        )}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        placeholder={fallbackPlaceholder}
      />
    );
  }

  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <EllipsisName
        name={value || fallbackPlaceholder}
        className="text-base font-semibold text-foreground whitespace-nowrap"
      />
      <Button
        variant="ghost"
        size="icon"
        className="cursor-pointer h-7 w-7"
        onClick={() => setEditing(true)}
        aria-label={t("bizForm.outputTitle.editAriaLabel")}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
