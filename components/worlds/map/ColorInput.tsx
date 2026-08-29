"use client";

import * as React from "react";

import { HsvColorPicker, BUBBLE_COLOR_PRESETS, type ColorPreset } from "@/components/ui/hsv-color-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ── Sélecteur couleur compact : carré + hex + popover HSV ─────────

export function ColorInput({
  color,
  onChange,
  presets = BUBBLE_COLOR_PRESETS,
}: {
  color: string;
  onChange: (hex: string) => void;
  presets?: ColorPreset[];
}) {
  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-7 w-7 shrink-0 rounded border border-input shadow-sm transition-shadow hover:ring-2 hover:ring-ring"
            style={{ backgroundColor: color }}
          />
        </PopoverTrigger>
        <PopoverContent
          className="w-60 p-3 z-[200]"
          side="bottom"
          align="start"
          onWheel={(e) => e.stopPropagation()}
        >
          <HsvColorPicker color={color} onChange={onChange} presets={presets} />
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
