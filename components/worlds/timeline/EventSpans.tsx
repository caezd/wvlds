"use client";

import * as React from "react";
import { assignSuiteLanes } from "@/lib/worldTimelineItems";

type Span = { id: string; top: number; bottom: number; x: number };

/** Écart entre deux barres qui se chevauchent. */
const LANE_GAP = 5;
/** Distance entre une barre (la plus proche) et le début des titres. */
const TITLE_GAP = 9;

/**
 * La durée des événements qui durent (migration 197) : une barre fine le
 * long du fil, de la ligne de l'événement (`[data-event-id]`) à celle de sa
 * fin (`[data-event-end-id]`), juste avant les titres — graphe des suites
 * compris, puisqu'on se cale sur le début du texte de l'événement. Deux
 * durées qui se chevauchent prennent chacune leur couloir, vers le fil.
 * Les positions se mesurent dans le DOM, comme les lignes de suite.
 */
export function EventSpans({
  containerRef,
  ids,
  version,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  /** Les événements dont le début et la fin sont à l'écran. */
  ids: readonly string[];
  /** Change quand la frise change : force une mesure. */
  version: string;
}) {
  const [spans, setSpans] = React.useState<Span[]>([]);

  const measure = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const measured = ids.flatMap((id) => {
      const start = container.querySelector<HTMLElement>(`[data-event-id="${id}"]`);
      const end = container.querySelector<HTMLElement>(`[data-event-end-id="${id}"]`);
      if (!start || !end) return [];
      const text = start.querySelector<HTMLElement>("[data-event-text]") ?? start;
      const s = start.getBoundingClientRect();
      const e = end.getBoundingClientRect();
      return [{
        id,
        top: s.top - rect.top + 10,
        bottom: e.top - rect.top + 10,
        x: text.getBoundingClientRect().left - rect.left - TITLE_GAP,
      }];
    });
    const lanes = assignSuiteLanes(measured);
    setSpans(measured.map((m, i) => ({ ...m, x: m.x - lanes[i] * LANE_GAP })));
  }, [containerRef, ids]);

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
          className="stroke-foreground/40"
          data-event-span={s.id}
        />
      ))}
    </svg>
  );
}
