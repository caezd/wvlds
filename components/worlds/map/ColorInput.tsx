"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { HsvColorPicker, normalizeHexColor, type ColorPreset } from "@/components/ui/hsv-color-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ── Sélecteur couleur compact : carré + hex + popover HSV ─────────

export function ColorInput({
  color,
  onChange,
  presets,
}: {
  color: string;
  onChange: (hex: string) => void;
  /** Pastilles du sélecteur ; absent : la palette « joueurs ». */
  presets?: ColorPreset[];
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
          className="w-64 overflow-hidden rounded-2xl p-0"
          side="bottom"
          align="start"
          onWheel={(e) => e.stopPropagation()}
        >
          <HsvColorPicker color={color} onChange={onChange} presets={presets} alpha framed={false} />
        </PopoverContent>
      </Popover>
      {/* Le code est normalisé à la saisie : la base n'accepte qu'un code
          hexadécimal (migrations 171 et 203), une frappe en cours n'a pas à
          y descendre. */}
      <input
        type="text"
        value={color}
        onChange={(e) => {
          const hex = normalizeHexColor(e.target.value, true);
          if (hex) onChange(hex);
        }}
        className="h-7 flex-1 rounded-md border border-input bg-transparent px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
