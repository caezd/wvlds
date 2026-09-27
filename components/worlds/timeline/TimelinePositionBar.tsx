"use client";

import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, CirclePause } from "lucide-react";

import { cn } from "@/lib/utils";
import { TIMELINE_ROOM_STATUSES, type TimelineMonthStop, type TimelineRoomStatus } from "@/lib/worldTimelineItems";
import type { WorldTimelineConfig } from "@/types/worlds";
import type { TimelineArc } from "@/components/worlds/timeline/useTimelineData";

/** La légende d'une année (« Eon », le nom d'ère) : petites capitales. */
export const YEAR_CAPTION = "text-[11px] font-semibold uppercase tracking-[0.15em] text-foreground/60";

/**
 * Le bas de la tête de la frise, toujours collé : où l'on en est (l'année,
 * le mois qui passe sous la tête, ses salons), des flèches vers le mois
 * d'avant et d'après ; à droite, l'arc survolé et les puces des arcs — ceux
 * que l'on survole, ou du mois en cours, en premier, les autres estompés.
 */
export function TimelinePositionBar({
  config,
  stop,
  onPrevious,
  onNext,
  arcs,
  bright,
  hovered,
}: {
  config: WorldTimelineConfig;
  stop: TimelineMonthStop | null;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  /** Tous les arcs, les prioritaires d'abord. */
  arcs: readonly TimelineArc[];
  /** Les arcs mis en avant ; `null` : tous. */
  bright: ReadonlySet<string> | null;
  /** L'arc du salon survolé, et son nombre d'épisodes. */
  hovered: { arc: TimelineArc; episodes: number } | null;
}) {
  const tv = useTranslations("worlds.timelineView");
  const monthName = stop && stop.month !== null ? (config.month_names[stop.month] ?? null) : null;
  return (
    <div
      role="group"
      aria-label={tv("position")}
      className="flex min-h-11 items-center gap-3 border-y border-border px-5 py-1.5"
      data-testid="timeline-position"
    >
      <div className="-ml-1.5 flex shrink-0 items-center">
        <button
          type="button"
          aria-label={tv("previousMonth")}
          disabled={!onPrevious}
          onClick={onPrevious ?? undefined}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          aria-label={tv("nextMonth")}
          disabled={!onNext}
          onClick={onNext ?? undefined}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
      {stop && (
        <p className="flex min-w-0 items-baseline gap-2 leading-none" data-testid="timeline-position-label">
          <span className={cn(YEAR_CAPTION, "shrink-0")}>
            {config.year_label} <span className="tabular-nums">{stop.year}</span>
            {config.era_name && ` ${config.era_name}`}
          </span>
          {monthName && <span className="truncate text-sm font-semibold text-foreground">{monthName}</span>}
          {stop.rooms > 0 && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{tv("roomsCount", { count: stop.rooms })}</span>
          )}
        </p>
      )}
      <div className="ml-auto flex min-w-0 items-center gap-3">
        {hovered && (
          <span
            className="hidden min-w-0 items-center gap-2 rounded-md px-2 py-0.5 text-xs sm:inline-flex"
            style={{ backgroundColor: `${hovered.arc.color}26` }}
            data-testid="timeline-hovered-arc"
          >
            <span className="truncate font-semibold" style={{ color: hovered.arc.color }}>{hovered.arc.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{tv("episodes", { count: hovered.episodes })}</span>
          </span>
        )}
        {arcs.length > 0 && (
          <ul className="flex shrink-0 items-center gap-1" aria-label={tv("arcs")} data-testid="timeline-arc-dots">
            {arcs.map((arc) => {
              const on = !bright || bright.has(arc.id);
              return (
                <li
                  key={arc.id}
                  className={cn("size-2.5 rounded-full transition-opacity", !on && "opacity-30")}
                  style={{ backgroundColor: arc.color }}
                  title={arc.name}
                  data-arc-dot={arc.id}
                  data-bright={on || undefined}
                >
                  <span className="sr-only">{arc.name}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** La marque d'un statut, telle qu'elle paraît sur le fil ; en pause, l'icône « cercle pause ». */
function StatusMark({ status }: { status: TimelineRoomStatus }) {
  if (status === "dormant") return <CirclePause className="size-3 shrink-0" strokeWidth={3} aria-hidden />;
  return (
    <span
      className={cn(
        "size-2.5 shrink-0 rounded-full border-[1.5px] border-foreground/60",
        status === "abandoned" && "border-dashed",
        status === "completed" && "bg-foreground/60",
      )}
      aria-hidden
    />
  );
}

/** La légende des marques du fil : les statuts des salons, l'événement. */
export function TimelineLegend({ className }: { className?: string }) {
  const tv = useTranslations("worlds.timelineView");
  return (
    <ul aria-label={tv("legend")} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {TIMELINE_ROOM_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-1.5 text-foreground/60">
          <StatusMark status={status} />
          <span className="text-muted-foreground">{tv(`roomStatus.${status}`)}</span>
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="size-2 shrink-0 rotate-45 bg-foreground/80" aria-hidden />
        {tv("eventLabel")}
      </li>
    </ul>
  );
}
