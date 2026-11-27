"use client";

import { useTranslations } from "next-intl";

import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { DAY_WEATHER_ICONS, dayDashes, dayMoment, type ChatroomDay } from "@/lib/chatroomDay";
import { cn } from "@/lib/utils";

/** « cloud-rain » → « cloudRain » : la clé du nom de l'icône (`chatrooms.dayStatus.icons`). */
function iconKey(name: string): string | null {
  if (!(DAY_WEATHER_ICONS as readonly string[]).includes(name)) return null;
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Le nom lisible d'une icône de météo, pour les lecteurs d'écran et les infobulles. */
export function useWeatherIconLabel() {
  const t = useTranslations("chatrooms.dayStatus");
  return (name: string) => {
    const key = iconKey(name);
    return key ? t(`icons.${key}`) : name;
  };
}

const TICKS = [0, 25, 50, 75, 100];

/**
 * La ligne d'une journée : l'icône de météo posée à son moment, son nom en
 * dessous. Après une ellipse, la position d'avant (estompée), puis un
 * pointillé par jour passé — sept au plus, puis « ··· ».
 */
export function ChatroomDayStrip({ day, className }: { day: ChatroomDay; className?: string }) {
  const t = useTranslations("chatrooms.dayStatus");
  const iconLabel = useWeatherIconLabel();
  const { dashes, overflow } = dayDashes(day.skipped);
  const jumped = day.skipped > 0;
  const position = Math.min(100, Math.max(0, day.position));

  return (
    <div role="group" aria-label={t("label")} className={cn("flex h-14 items-center gap-1.5 pb-4", className)}>
      {jumped && day.fromIcon && (
        <span
          data-testid="day-from"
          role="img"
          aria-label={iconLabel(day.fromIcon)}
          title={iconLabel(day.fromIcon)}
          className="shrink-0 text-muted-foreground opacity-50"
        >
          <LazyLucideIcon name={day.fromIcon} className="size-4" aria-hidden />
        </span>
      )}
      {Array.from({ length: dashes }, (_, i) => (
        <span key={i} data-testid="day-dash" aria-hidden className="w-4 shrink-0 border-t-2 border-dashed border-muted-foreground/40" />
      ))}
      {overflow && (
        <span data-testid="day-overflow" aria-hidden className="shrink-0 px-0.5 font-bold tracking-[0.2em] text-muted-foreground">
          ···
        </span>
      )}
      {jumped && <span className="sr-only">{t("later", { count: day.skipped })}</span>}

      <div className="relative mx-4 h-0.5 min-w-24 flex-1 rounded-full bg-border">
        {TICKS.map((tick) => (
          <span key={tick} aria-hidden className="absolute -top-0.75 h-2 w-px bg-border" style={{ left: `${tick}%` }} />
        ))}
        <span
          data-testid="day-icon"
          role="img"
          aria-label={iconLabel(day.icon)}
          title={iconLabel(day.icon)}
          className="absolute top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-background text-foreground"
          style={{ left: `${position}%` }}
        >
          <LazyLucideIcon name={day.icon} className="size-3.5" aria-hidden />
        </span>
        <span
          className="absolute top-4 -translate-x-1/2 whitespace-nowrap text-xs italic text-foreground"
          style={{ left: `${position}%` }}
        >
          {t(`moments.${dayMoment(position)}`)}
        </span>
      </div>
    </div>
  );
}
