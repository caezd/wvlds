"use client";

import { Palette } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HsvColorPicker, PLAYER_COLOR_PRESETS } from "@/components/ui/hsv-color-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_PLAYER_COLOR } from "@/lib/playerColors";

/**
 * Le choix d'une couleur, tel que l'encadré du composer l'a posé : la pipette
 * (avec la couleur en cours) qui ouvre le sélecteur libre, les douze pastilles
 * de la palette « joueurs », et, quand `noneLabel` est fourni, une bascule
 * « Aucune » en bout de ligne. `value === ""` veut dire « aucune couleur ».
 */
export function ColorSwatchRow({
  value,
  onChange,
  chooseLabel,
  noneLabel,
  className,
}: {
  value: string;
  onChange: (color: string) => void;
  /** L'intitulé de la pipette (infobulle). */
  chooseLabel: string;
  /** Présent : une bascule « sans couleur », qui pose `""`. */
  noneLabel?: string;
  className?: string;
}) {
  const current = value || DEFAULT_PLAYER_COLOR;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-1.5 has-[>svg]:px-1.5"
            title={chooseLabel}
            aria-label={chooseLabel}
          >
            <Palette className="h-3.5 w-3.5" />
            <span className="h-3 w-3 rounded-full border border-border" style={{ backgroundColor: current }} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 overflow-hidden rounded-2xl p-0" align="start">
          <HsvColorPicker color={current} onChange={onChange} presets={[]} alpha framed={false} />
        </PopoverContent>
      </Popover>

      {PLAYER_COLOR_PRESETS.map((c) => (
        <button
          key={c.value}
          type="button"
          title={c.label}
          aria-label={c.label}
          aria-pressed={value.toLowerCase() === c.value.toLowerCase()}
          onClick={() => onChange(c.value)}
          className={cn(
            "h-4 w-4 shrink-0 rounded-sm border border-border transition-shadow hover:ring-1 hover:ring-ring",
            value.toLowerCase() === c.value.toLowerCase() && "ring-2 ring-ring",
          )}
          style={{ backgroundColor: c.value }}
        />
      ))}

      {noneLabel && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={value === ""}
          className="ml-auto h-6 px-2 text-xs"
          onClick={() => onChange("")}
        >
          {noneLabel}
        </Button>
      )}
    </div>
  );
}
