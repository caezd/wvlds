"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { HsvColorPicker } from "@/components/ui/hsv-color-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ── Sélecteur couleur compact : carré + hex + popover HSV ─────────

export function ColorInput({
  color,
  onChange,
}: {
  color: string;
  onChange: (hex: string) => void;
}) {
  const t = useTranslations("common");
  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-7 w-7 shrink-0 rounded border border-input shadow-sm transition-shadow hover:ring-2 hover:ring-ring"
            style={{ backgroundColor: color }}
            aria-label={t("chooseColor")}
          />
        </PopoverTrigger>
        <PopoverContent
          className="w-64 overflow-hidden rounded-2xl p-0 z-[200]"
          side="bottom"
          align="start"
          onWheel={(e) => e.stopPropagation()}
        >
          <HsvColorPicker color={color} onChange={onChange} alpha framed={false} />
        </PopoverContent>
      </Popover>
      <input
        type="text"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
