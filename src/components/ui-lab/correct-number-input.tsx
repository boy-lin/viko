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
  max?: number
  step?: number
  placeholder?: string
}

export default function CorrectNumberInput({
  value,
  onChange,
  label,
  className,
  min = 0,
  max,
  step,
  placeholder,
}: CorrectNumberInputProps) {
  const id = useId()

  const effectiveStep = typeof step === "number" && step > 0 ? step : 1
  const clampValue = (next: number) => {
    const withMin = Math.max(min, next)
    if (typeof max === "number") {
      return Math.min(max, withMin)
    }
    return withMin
  }

  const increment = () => onChange(clampValue((value || 0) + effectiveStep))
  const decrement = () => onChange(clampValue((value || 0) - effectiveStep))

  return (
    <div className={cn("w-full max-w-xs", className)}>
      <div className="relative text-foreground bg-muted/30 rounded-lg">
        <input
          id={id}
          type="number"
          inputMode={effectiveStep % 1 === 0 ? "numeric" : "decimal"}
          min={min}
          max={max}
          step={effectiveStep}
          value={!value ? "" : value}
          onChange={(e) => {
            const val = e.target.value
            if (val === "") {
              onChange(0)
              return
            }
            const parsed = Number(val)
            if (Number.isNaN(parsed)) return
            onChange(clampValue(parsed))
          }}
          className="peer w-full h-9 pl-2 pr-6 text-foreground placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-muted-foreground/20 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0"
          placeholder={label ? " " : (placeholder ?? "")}
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
