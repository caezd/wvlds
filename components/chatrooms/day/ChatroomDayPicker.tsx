"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { SectionLabel } from "@/components/ui/section-label";
import { DAY_WEATHER_ICONS, dayMoment } from "@/lib/chatroomDay";
import { cn } from "@/lib/utils";
import { useWeatherIconLabel } from "./ChatroomDayStrip";

/**
 * Choisir le temps d'un salon : une icône de météo, puis son moment sur la
 * ligne de la journée. Partagé par la fenêtre « Ellipse », les réglages du
 * salon et « Nouveau jeu ».
 */
export function ChatroomDayPicker({
  icon,
  position,
  onChange,
  onCommit,
}: {
  icon: string;
  position: number;
  onChange: (icon: string, position: number) => void;
  /** Le choix est arrêté : icône cliquée, curseur relâché. */
  onCommit?: (icon: string, position: number) => void;
}) {
  const t = useTranslations("chatrooms.dayStatus");
  const iconLabel = useWeatherIconLabel();
  const ids = useId();

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionLabel as="p" id={`${ids}-weather`}>{t("weather")}</SectionLabel>
        <div role="radiogroup" aria-labelledby={`${ids}-weather`} className="grid grid-cols-8 gap-1.5">
          {DAY_WEATHER_ICONS.map((name) => {
            const checked = name === icon;
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={iconLabel(name)}
                title={iconLabel(name)}
                onClick={() => {
                  onChange(name, position);
                  onCommit?.(name, position);
                }}
                className={cn(
                  "grid h-10 place-items-center rounded-md border transition-colors",
                  checked ? "border-foreground bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted/60",
                )}
              >
                <LazyLucideIcon name={name} className="size-4" aria-hidden />
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor={`${ids}-moment`} className="block">
          <SectionLabel as="span">{t("moment")}</SectionLabel>
        </label>
        {/* Le curseur natif (clavier, lecteur d'écran) est transparent, posé sur la ligne dessinée. */}
        <div className="relative h-9">
          <span aria-hidden className="absolute inset-x-3.5 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border" />
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-foreground bg-background"
            style={{ left: `calc(0.875rem + (100% - 1.75rem) * ${position / 100})` }}
          >
            <LazyLucideIcon name={icon} className="size-3.5" aria-hidden />
          </span>
          <input
            id={`${ids}-moment`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={position}
            aria-valuetext={t(`moments.${dayMoment(position)}`)}
            onChange={(e) => onChange(icon, Number(e.target.value))}
            onPointerUp={(e) => onCommit?.(icon, Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => onCommit?.(icon, Number((e.target as HTMLInputElement).value))}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </div>
        <div aria-hidden className="flex justify-between text-xs text-muted-foreground">
          <span>{t("moments.dawn")}</span>
          <span>{t("moments.noon")}</span>
          <span>{t("moments.dusk")}</span>
          <span>{t("moments.night")}</span>
        </div>
      </div>
    </div>
  );
}
