"use client"

import { useId } from "react"
import { ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface CorrectNumberInputProps {
  value?: number
  onChange: (value: number) => void
  label?: string
  className?: string
  min?: number
}

export default function CorrectNumberInput({
  value,
  onChange,
  label,
  className,
  min = 0,
}: CorrectNumberInputProps) {
  const id = useId()

  const increment = () => onChange((value || 0) + 1)
  const decrement = () => onChange((value || 0) > min ? (value || 0) - 1 : min)

  return (
    <div className={cn("w-full max-w-xs", className)}>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value === 0 ? "" : value}
          onChange={(e) => {
            const val = e.target.value
            onChange(val === "" ? 0 : Number(val))
          }}
          className="peer w-full h-9 pl-4 pr-10 text-foreground bg-muted/30 border border-muted-foreground/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-muted-foreground/20 transition-all"
          placeholder={label ? " " : ""}
        />

        {label && (
          <label
            htmlFor={id}
            className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm transition-all duration-200 pointer-events-none",
              value !== 0
                ? "-translate-y-6 top-1/2 text-xs text-foreground"
                : "peer-placeholder-shown:translate-y-1/2"
            )}
          >
            {label}
          </label>
        )}

        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col h-8 justify-between">
          <button
            type="button"
            onClick={increment}
            className="flex items-center justify-center w-7 h-4 hover:bg-black/10 dark:hover:bg-white/10 transition-colors rounded"
          >
            <ChevronUp size={10} className="text-foreground" />
          </button>
          <button
            type="button"
            onClick={decrement}
            className="flex items-center justify-center w-7 h-4 hover:bg-black/10 dark:hover:bg-white/10 transition-colors rounded"
          >
            <ChevronDown size={10} className="text-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}
