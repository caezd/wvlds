"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { assignSuiteLanes } from "@/lib/worldTimelineItems";
import type { TimelineLayout } from "@/components/worlds/timeline/TimelineLayout";

type Span = { id: string; top: number; bottom: number; x: number };

/** Écart entre deux barres qui se chevauchent. */
const LANE_GAP = 6;
/** Distance entre une barre (la plus proche) et le début des titres. */
const TITLE_GAP = 10;

/**
 * Le décalage à donner aux titres pour loger `lanes` barres entre l'anneau
 * d'une ligne et son texte : sans lui, trois barres s'entassaient dans les
 * 22px qui les séparent. Une barre tient seule (12px d'air à gauche, 10 à
 * droite) ; chacune de plus écarte les titres d'autant, moins 2px, pour
 * garder environ 10px de part et d'autre.
 */
export function eventSpanPad(lanes: number): number {
  return Math.max(0, (lanes - 1) * LANE_GAP - 2);
}

/** Un événement qui dure, à tracer ; un bout hors de ce qui est rendu (la
 *  frise ne rend qu'une fenêtre de ses dates) prolonge la barre jusqu'au bord. */
export type EventSpan = { id: string; clipTop: boolean; clipBottom: boolean };

/**
 * Les barres, sur le relevé de la frise : de la ligne de l'événement à celle
 * de sa fin (`<id>:end`), ou jusqu'au bord pour un bout hors champ ; juste
 * avant le début des titres, un couloir par barre qui en chevauche une autre.
 */
export function layoutEventSpans(layout: TimelineLayout, toDraw: readonly EventSpan[]): { spans: Span[]; laneCount: number } {
  if (layout.titleX === null) return { spans: [], laneCount: 0 };
  const x = layout.titleX - TITLE_GAP;
  const measured = toDraw.flatMap(({ id, clipTop, clipBottom }) => {
    const start = layout.rows.get(id);
    const end = layout.rows.get(`${id}:end`);
    // Une ligne attendue à l'écran mais pas (encore) rendue : rien.
    if ((!clipTop && !start) || (!clipBottom && !end)) return [];
    return [{
      id,
      top: !clipTop && start ? start.top + 10 : 0,
      bottom: !clipBottom && end ? end.top + 10 : layout.height,
      x,
    }];
  });
  const lanes = assignSuiteLanes(measured);
  return {
    spans: measured.map((m, i) => ({ ...m, x: m.x - lanes[i] * LANE_GAP })),
    laneCount: lanes.length === 0 ? 0 : Math.max(...lanes) + 1,
  };
}

/**
 * La durée des événements qui durent (migration 197) : une barre fine le
 * long du fil, de la ligne de l'événement à celle de sa fin, juste avant les
 * titres — graphe des suites compris, puisqu'on se cale sur le début de leur
 * texte. Deux durées qui se chevauchent prennent chacune leur couloir, vers
 * le fil. Les positions viennent du relevé commun de la frise (voir
 * TimelineLayout). Au survol d'un événement (« pendant ce temps », voir
 * WorldTimeline), sa barre fonce et les autres s'estompent.
 */
export function EventSpans({
  layout,
  spans: toDraw,
  active = null,
  onLanes,
}: {
  layout: TimelineLayout;
  /** Les événements dont la durée croise ce qui est rendu. */
  spans: readonly EventSpan[];
  /** L'événement survolé : sa barre ressort. */
  active?: string | null;
  /** Le nombre de couloirs pris par les barres, pour que la frise écarte
   *  ses titres d'autant (voir `eventSpanPad`). */
  onLanes?: (count: number) => void;
}) {
  const { spans, laneCount } = React.useMemo(() => layoutEventSpans(layout, toDraw), [layout, toDraw]);
  React.useEffect(() => {
    onLanes?.(laneCount);
  }, [onLanes, laneCount]);

  if (spans.length === 0) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
      aria-hidden
      data-testid="timeline-event-spans"
    >
      {spans.map((s) => (
        <path
          key={s.id}
          d={`M ${s.x} ${s.top} V ${s.bottom}`}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          className={cn(
            "transition-opacity",
            active === s.id ? "stroke-foreground" : "stroke-foreground/40",
            active && active !== s.id && "opacity-30",
          )}
          data-event-span={s.id}
          data-active={active === s.id || undefined}
        />
      ))}
    </svg>
  );
}
