"use client"

import * as React from "react"
import { Minus, Plus } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Un champ numérique au style shadcn : l'`Input` du dépôt, collé à deux
 * boutons −/+ (le registre shadcn n'en propose pas). Le champ garde le rôle
 * `spinbutton` et le clavier natif ; les boutons restent dans les bornes.
 * `null` : champ vide.
 */
function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  disabled,
  className,
  "aria-label": ariaLabel,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "min" | "max" | "step"> & {
  value: number | null
  onValueChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
}) {
  const t = useTranslations("common")
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  // Champ vide : on part du minimum (ou de 0), comme s'il y était déjà.
  const nudge = (direction: 1 | -1) =>
    onValueChange(clamp((value ?? min ?? 0) + (value === null && direction === -1 ? 0 : direction * step)))
  const named = (action: string) => (ariaLabel ? `${action} : ${ariaLabel}` : action)

  return (
    <div data-slot="number-input" className={cn("flex w-32 shrink-0", className)}>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value
          if (raw.trim() === "") return onValueChange(null)
          const n = Number(raw)
          if (Number.isFinite(n)) onValueChange(n)
        }}
        className="min-w-0 rounded-r-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        {...props}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        tabIndex={-1}
        aria-label={named(t("decrease"))}
        disabled={disabled || (value !== null && min !== undefined && value <= min)}
        onClick={() => nudge(-1)}
        className="size-9 shrink-0 rounded-none border-l-0 shadow-none"
      >
        <Minus className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        tabIndex={-1}
        aria-label={named(t("increase"))}
        disabled={disabled || (value !== null && max !== undefined && value >= max)}
        onClick={() => nudge(1)}
        className="size-9 shrink-0 rounded-l-none border-l-0 shadow-none"
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

export { NumberInput }
