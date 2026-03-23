"use client"

import { useEffect, useId, useMemo, useState } from "react"
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
  const allowDecimal = effectiveStep % 1 !== 0

  const formatValue = (next?: number) => {
    if (typeof next !== "number" || Number.isNaN(next)) return ""
    return String(next)
  }

  const [rawValue, setRawValue] = useState(() => formatValue(value))

  useEffect(() => {
    setRawValue(formatValue(value))
  }, [value])

  const clampValue = (next: number) => {
    const withMin = Math.max(min, next)
    if (typeof max === "number") {
      return Math.min(max, withMin)
    }
    return withMin
  }

  const currentNumericValue = useMemo(() => {
    const parsed = Number(rawValue)
    if (Number.isFinite(parsed)) return parsed
    return value ?? 0
  }, [rawValue, value])

  const increment = () => {
    const nextValue = clampValue(currentNumericValue + effectiveStep)
    setRawValue(formatValue(nextValue))
    onChange(nextValue)
  }

  const decrement = () => {
    const nextValue = clampValue(currentNumericValue - effectiveStep)
    setRawValue(formatValue(nextValue))
    onChange(nextValue)
  }

  const isAllowedInput = (next: string) => {
    if (next === "") return true
    if (next === "-" || next === "." || next === "-.") return true
    const pattern = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/
    return pattern.test(next)
  }

  return (
    <div className={cn("w-full max-w-xs", className)}>
      <div className="relative text-foreground bg-muted/30 rounded-lg">
        <input
          id={id}
          type="text"
          inputMode={allowDecimal ? "decimal" : "numeric"}
          min={min}
          max={max}
          step={effectiveStep}
          value={rawValue}
          onChange={(e) => {
            const val = e.target.value
            if (!isAllowedInput(val)) return
            setRawValue(val)
            if (val === "") {
              onChange(0)
              return
            }
            const parsed = Number(val)
            if (Number.isNaN(parsed)) return
            onChange(clampValue(parsed))
          }}
          onBlur={() => {
            if (rawValue === "") return
            const parsed = Number(rawValue)
            if (Number.isNaN(parsed)) {
              setRawValue(formatValue(value))
              return
            }
            const normalized = clampValue(parsed)
            setRawValue(formatValue(normalized))
            if (normalized !== value) {
              onChange(normalized)
            }
          }}
          className="peer rounded-lg w-full h-9 pl-2 pr-6 text-foreground placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-muted-foreground/20 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0"
          placeholder={label ? " " : (placeholder ?? "")}
        />

        {label && (
          <label
            htmlFor={id}
            className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm transition-all duration-200 pointer-events-none",
              rawValue !== ""
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
