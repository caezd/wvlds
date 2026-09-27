"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { TimelineMinimapYear } from "@/lib/worldTimelineItems";
import type { WorldTimelineConfig } from "@/types/worlds";

/**
 * La mini-carte de la frise, à sa droite : chaque année (son numéro), et
 * dessous chacun de ses mois, une ligne de 10px dont la barre dit combien
 * de salons il réunit. Elle commence en face du bandeau de position de la
 * frise (bordée dessus comme lui), et défile avec elle : le mois lu reste au milieu, et
 * ressort ; un trait rouge barre le mois actuel du monde ; un arc isolé
 * (survolé ou filtré) teinte les mois où il a un épisode. Un clic mène à
 * l'année ou au mois.
 *
 * Elle ne mesure pas la frise : le mois lu vient de son défilement.
 */
export function TimelineMinimap({
  config,
  years,
  max,
  current,
  isolatedArc,
  onYear,
  onMonth,
  top = 0,
  className,
}: {
  config: WorldTimelineConfig;
  years: readonly TimelineMinimapYear[];
  /** Le plus de salons sur un mois (au moins 1). */
  max: number;
  /** Le mois lu en ce moment. */
  current: { year: number; month: number | null } | null;
  isolatedArc: { id: string; color: string } | null;
  onYear: (year: number) => void;
  onMonth: (year: number, month: number) => void;
  /** Le haut du bandeau de position (année, mois) dans la tête : la mini-carte commence en face, bordée dessus comme lui. */
  top?: number;
  className?: string;
}) {
  const tv = useTranslations("worlds.timelineView");
  // Le mois lu, gardé au milieu : la mini-carte suit le défilement de la frise.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentYear = current?.year ?? null;
  const currentMonth = current?.month ?? null;
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || currentYear === null) return;
    const target =
      scroller.querySelector<HTMLElement>("[aria-current='true']") ??
      scroller.querySelector<HTMLElement>(`[data-minimap-year='${currentYear}']`);
    if (!target || typeof scroller.scrollTo !== "function") return;
    const top = target.offsetTop - scroller.clientHeight / 2 + target.offsetHeight / 2;
    scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [currentYear, currentMonth]);
  const yearName = (year: number) => `${config.year_label} ${year}${config.era_name ? ` ${config.era_name}` : ""}`;
  return (
    <nav
      aria-label={tv("minimapLabel")}
      className={cn("w-[52px] shrink-0 flex-col border-l border-t border-l-border-soft border-t-border", className)}
      style={{ marginTop: top }}
      data-testid="timeline-minimap"
    >
      <div
        ref={scrollerRef}
        // Positionnée : `offsetTop` des lignes se compte depuis elle. Sans
        // barre de défilement : elle suit la frise.
        className="relative min-h-0 flex-1 space-y-2.5 overflow-y-auto pb-3 pl-1 pr-2 pt-2.5 [scrollbar-width:none]"
        data-testid="timeline-minimap-scroller"
      >
      {years.map(({ year, months }) => {
        const isCurrentYear = current?.year === year;
        return (
          <div key={year} className="flex flex-col" data-minimap-year={year}>
            <button
              type="button"
              onClick={() => onYear(year)}
              aria-label={yearName(year)}
              className={cn(
                "mb-0.5 shrink-0 text-right text-[10px] font-semibold leading-none tabular-nums transition-colors hover:text-foreground",
                isCurrentYear ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {year}
            </button>
            <div className="flex flex-col gap-px">
              {months.map((m, month) => {
                const isCurrent = isCurrentYear && current?.month === month;
                const isToday = year === config.current_year && month === config.current_month;
                const arcColor = isolatedArc && m.arcIds.has(isolatedArc.id) ? isolatedArc.color : null;
                const label = tv("minimapMonth", {
                  month: config.month_names[month] ?? String(month + 1),
                  year: yearName(year),
                  count: m.rooms,
                  event: m.hasEvent ? "true" : "false",
                });
                const width = m.rooms === 0 ? 0 : Math.max(20, (m.rooms / max) * 100);
                return (
                  <button
                    key={month}
                    type="button"
                    onClick={() => { if (m.items > 0) onMonth(year, month); }}
                    aria-label={label}
                    aria-current={isCurrent ? "true" : undefined}
                    aria-disabled={m.items === 0 || undefined}
                    title={isToday ? `${label} · ${tv("today")}` : label}
                    className={cn(
                      "relative flex h-2.5 shrink-0 items-center justify-end rounded-[2px] hover:bg-muted",
                      isCurrent && "bg-muted",
                      m.items > 0 ? "cursor-pointer" : "cursor-default",
                    )}
                    data-minimap-month={month}
                  >
                    <span
                      className={cn(
                        "h-[60%] rounded-[1px]",
                        !arcColor && (isCurrent
                          ? "bg-foreground"
                          : m.hasEvent ? "bg-zinc-500 dark:bg-zinc-400" : "bg-zinc-300 dark:bg-zinc-600"),
                      )}
                      style={{ width: `${width}%`, ...(arcColor ? { backgroundColor: arcColor } : {}) }}
                      data-testid="timeline-minimap-bar"
                      aria-hidden
                    />
                    {isToday && (
                      <span
                        className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-destructive"
                        data-testid="timeline-minimap-today"
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>
    </nav>
  );
}
