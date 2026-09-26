"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { assignSuiteLanes } from "@/lib/worldTimelineItems";

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
 * La durée des événements qui durent (migration 197) : une barre fine le
 * long du fil, de la ligne de l'événement (`[data-event-id]`) à celle de sa
 * fin (`[data-event-end-id]`), juste avant les titres — graphe des suites
 * compris, puisqu'on se cale sur le début de leur texte (`[data-title-start]`). Deux
 * durées qui se chevauchent prennent chacune leur couloir, vers le fil.
 * Les positions se mesurent dans le DOM, comme les lignes de suite. Au
 * survol d'un événement (« pendant ce temps », voir WorldTimeline), sa barre
 * fonce et les autres s'estompent.
 */
export function EventSpans({
  containerRef,
  spans: toDraw,
  active = null,
  version,
  onLanes,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  /** Les événements dont la durée croise ce qui est rendu. */
  spans: readonly EventSpan[];
  /** L'événement survolé : sa barre ressort. */
  active?: string | null;
  /** Change quand la frise change : force une mesure. */
  version: string;
  /** Le nombre de couloirs pris par les barres, pour que la frise écarte
   *  ses titres d'autant (voir `eventSpanPad`). */
  onLanes?: (count: number) => void;
}) {
  const [spans, setSpans] = React.useState<Span[]>([]);

  const measure = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const measured = toDraw.flatMap(({ id, clipTop, clipBottom }) => {
      const start = clipTop ? null : container.querySelector<HTMLElement>(`[data-event-id="${id}"]`);
      const end = clipBottom ? null : container.querySelector<HTMLElement>(`[data-event-end-id="${id}"]`);
      if ((!clipTop && !start) || (!clipBottom && !end)) return [];
      // Tous les titres commencent au même retrait : celui de la ligne, ou
      // de n'importe quelle ligne quand les deux bouts sont hors champ.
      const text = (start ?? end ?? container).querySelector<HTMLElement>("[data-title-start]");
      if (!text) return [];
      return [{
        id,
        top: start ? start.getBoundingClientRect().top - rect.top + 10 : 0,
        bottom: end ? end.getBoundingClientRect().top - rect.top + 10 : rect.height,
        x: text.getBoundingClientRect().left - rect.left - TITLE_GAP,
      }];
    });
    const lanes = assignSuiteLanes(measured);
    setSpans(measured.map((m, i) => ({ ...m, x: m.x - lanes[i] * LANE_GAP })));
    onLanes?.(lanes.length === 0 ? 0 : Math.max(...lanes) + 1);
  }, [containerRef, toDraw, onLanes]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure, version]);
  // Au montage, la référence du conteneur (un parent) n'est pas encore posée
  // pendant les effets de mise en page de ses enfants : on remesure après.
  React.useEffect(() => {
    measure();
  }, [measure]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, measure]);

  if (spans.length === 0) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
      aria-hidden
      data-testid="timeline-event-spans"
      data-layout={version}
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
