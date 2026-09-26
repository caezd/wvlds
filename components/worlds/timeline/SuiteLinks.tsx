"use client";

import * as React from "react";
import { assignSuiteLanes } from "@/lib/worldTimelineItems";

export type SuiteLink = { from: string; to: string; color: string | null };
type Drawn = { key: string; top: number; bottom: number; lane: number; color: string | null };

const LANE_GAP = 10;
const EDGE = 12;
const STUB = 14;
const RADIUS = 6;

/**
 * Les lignes de suite de la frise : une fine courbe, dans la marge droite,
 * relie un salon à sa suite — d'une année à l'autre s'il le faut. Chaque
 * ligne a son couloir (voir `assignSuiteLanes`) ; `onLanes` en donne le
 * nombre, pour que la frise laisse la place à droite.
 *
 * Les positions se mesurent dans le DOM (`[data-room-id]`), à chaque
 * changement de la liste et de la taille du conteneur.
 */
export function SuiteLinks({
  containerRef,
  links,
  version,
  onLanes,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  links: SuiteLink[];
  /** Change quand la frise change (filtres, données) : force une mesure. */
  version: string;
  onLanes: (count: number) => void;
}) {
  const [drawn, setDrawn] = React.useState<Drawn[]>([]);
  const [width, setWidth] = React.useState(0);

  const measure = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const centerOf = (id: string) => {
      const el = container.querySelector<HTMLElement>(`[data-room-id="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.top - box.top + Math.min(r.height, 20) / 2;
    };
    const spans: { key: string; top: number; bottom: number; color: string | null }[] = [];
    for (const link of links) {
      const a = centerOf(link.from);
      const b = centerOf(link.to);
      if (a === null || b === null) continue;
      spans.push({ key: `${link.from}>${link.to}`, top: Math.min(a, b), bottom: Math.max(a, b), color: link.color });
    }
    const lanes = assignSuiteLanes(spans);
    setDrawn(spans.map((s, i) => ({ ...s, lane: lanes[i] })));
    setWidth(box.width);
    onLanes(spans.length ? Math.max(...lanes) + 1 : 0);
  }, [containerRef, links, onLanes]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure, version]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, measure]);

  if (drawn.length === 0) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden
      data-testid="timeline-suite-links"
    >
      {drawn.map((d) => {
        const x = width - EDGE - d.lane * LANE_GAP;
        const x0 = x - STUB;
        const r = Math.min(RADIUS, (d.bottom - d.top) / 2);
        const path = [
          `M ${x0} ${d.top}`,
          `H ${x - r}`,
          `Q ${x} ${d.top} ${x} ${d.top + r}`,
          `V ${d.bottom - r}`,
          `Q ${x} ${d.bottom} ${x - r} ${d.bottom}`,
          `H ${x0}`,
        ].join(" ");
        return (
          <path
            key={d.key}
            d={path}
            data-suite={d.key}
            fill="none"
            strokeWidth={1.5}
            className={d.color ? undefined : "stroke-foreground/30"}
            style={d.color ? { stroke: d.color, opacity: 0.8 } : undefined}
          />
        );
      })}
    </svg>
  );
}
