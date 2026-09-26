"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { formatTimelineLabel } from "@/lib/worldTimeline";
import { upcomingHolidays } from "@/lib/worldTimelineItems";
import type { WorldTimelineConfig } from "@/types/worlds";

/**
 * Les prochaines fêtes du calendrier du monde (`timeline_config.holidays`),
 * à partir de sa date actuelle : de quoi donner l'idée d'une scène à ouvrir.
 * Tout vient de la configuration déjà chargée : rien à requêter.
 */
export function WorldHolidaysWidget({
  config,
  limit = 3,
}: {
  config?: WorldTimelineConfig;
  limit?: number;
}) {
  const t = useTranslations("worlds.home.holidays");
  const upcoming = useMemo(
    () =>
      config
        ? upcomingHolidays(
            config.holidays,
            { year: config.current_year, month: config.current_month },
            config.month_names.length,
            limit,
          )
        : [],
    [config, limit],
  );

  return (
    <div className="rounded-lg border">
      <div className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground">
        <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{t("title")}</span>
      </div>
      {!config || upcoming.length === 0 ? (
        <p className="border-t border-border-soft px-4 py-3 text-xs text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="border-t border-border-soft py-1">
          {upcoming.map((h) => (
            <li key={`${h.month}:${h.day ?? ""}:${h.name}`} className="flex items-baseline gap-2.5 px-4 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{h.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatTimelineLabel(config, { year: h.year, month: h.month, day: h.day })}
              </span>
              <span className="w-20 shrink-0 text-right text-xs text-muted-foreground" data-testid="holiday-when">
                {h.monthsAway === 0 ? t("thisMonth") : t("inMonths", { count: h.monthsAway })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
