"use client";

import * as React from "react";
import { assignSuiteLanes, buildSuiteChains, type SuitePair } from "@/lib/worldTimelineItems";

export type SuiteLink = SuitePair;

/**
 * Comment la frise relie un salon à sa suite (choisi par chacun, voir
 * WorldTimeline) :
 * - `rail`  : un trait par chaîne dans la marge droite, une pastille par
 *             salon — façon plan de métro ;
 * - `graph` : des couloirs entre le fil et les titres, où chaque anneau se
 *             branche — façon historique git.
 * Indépendamment du style, « au survol seulement » ne trace rien au repos :
 * la chaîne du salon survolé s'allume.
 */
export type SuiteStyle = "rail" | "graph";
export const SUITE_STYLES: readonly SuiteStyle[] = ["rail", "graph"];

type Point = { id: string; y: number };
type Drawn = { key: string; points: Point[]; top: number; bottom: number; lane: number; color: string | null };

const EDGE = 12;
const STUB = 14;
/** Écart entre couloirs, par style. */
const LANE_GAP: Record<SuiteStyle, number> = { rail: 10, graph: 8 };
/** Distance entre le fil et le premier couloir du graphe. */
export const GRAPH_OFFSET = 14;

/**
 * Le calque des lignes de suite. Les positions se mesurent dans le DOM
 * (`[data-room-id]`, et l'anneau d'un salon pour le graphe), à chaque
 * changement de la frise et de la taille du conteneur.
 *
 * Les couloirs se répartissent toujours sur toutes les chaînes, même quand
 * seule celle du salon survolé est tracée : la place réservée (`onLanes`)
 * ne bouge pas au survol, et les titres non plus.
 */
export function SuiteLinks({
  containerRef,
  links,
  style,
  only,
  version,
  onLanes,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  links: SuiteLink[];
  style: SuiteStyle;
  /** Au survol seulement : les salons de la chaîne à tracer ; `null` pour toutes. */
  only: ReadonlySet<string> | null;
  /** Change quand la frise change (filtres, données) : force une mesure. */
  version: string;
  onLanes: (count: number) => void;
}) {
  const [drawn, setDrawn] = React.useState<Drawn[]>([]);
  const [box, setBox] = React.useState({ width: 0, filX: 0 });

  const measure = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const yOf = (id: string) => {
      const el = container.querySelector<HTMLElement>(`[data-room-id="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.top - rect.top + Math.min(r.height, 20) / 2;
    };
    // Le fil : le centre d'un anneau de salon.
    const ring = container.querySelector<HTMLElement>("[data-room-id] [data-testid='timeline-ring']");
    const ringRect = ring?.getBoundingClientRect();
    const filX = ringRect ? ringRect.left - rect.left + ringRect.width / 2 : 0;

    const chains = buildSuiteChains(links)
      .map((c) => ({
        color: c.color,
        points: c.ids.map((id) => ({ id, y: yOf(id) })).filter((p): p is Point => p.y !== null),
      }))
      .filter((c) => c.points.length > 1);
    const spans = chains.map((c) => ({
      top: Math.min(...c.points.map((p) => p.y)),
      bottom: Math.max(...c.points.map((p) => p.y)),
    }));
    const lanes = assignSuiteLanes(spans);
    setDrawn(chains.map((c, i) => ({
      key: c.points.map((p) => p.id).join(">"),
      points: c.points,
      top: spans[i].top,
      bottom: spans[i].bottom,
      lane: lanes[i],
      color: c.color,
    })));
    setBox({ width: rect.width, filX });
    onLanes(chains.length ? Math.max(...lanes) + 1 : 0);
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

  const shown = only ? drawn.filter((d) => d.points.some((p) => only.has(p.id))) : drawn;
  if (shown.length === 0) return null;
  const gap = LANE_GAP[style];
  const strokeProps = (color: string | null) => ({
    className: color ? undefined : "stroke-foreground/30",
    style: color ? { stroke: color, opacity: 0.85 } : undefined,
  });
  const fillProps = (color: string | null) => ({
    className: color ? undefined : "fill-foreground/40",
    style: color ? { fill: color } : undefined,
  });

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden
      data-testid="timeline-suite-links"
      data-style={style}
    >
      {shown.map((d) => {
        if (style === "graph") {
          // Un couloir entre le fil et les titres ; chaque anneau s'y branche.
          const x = box.filX + GRAPH_OFFSET + d.lane * gap;
          return (
            <g key={d.key} data-suite={d.key}>
              <path d={`M ${x} ${d.top} V ${d.bottom}`} fill="none" strokeWidth={1.5} {...strokeProps(d.color)} />
              {d.points.map((p) => (
                <g key={p.id}>
                  <path d={`M ${x} ${p.y} H ${box.filX + 7}`} fill="none" strokeWidth={1.5} {...strokeProps(d.color)} />
                  <circle cx={x} cy={p.y} r={2.5} {...fillProps(d.color)} />
                </g>
              ))}
            </g>
          );
        }
        // Un rail dans la marge droite, une pastille par salon.
        const x = box.width - EDGE - d.lane * gap;
        return (
          <g key={d.key} data-suite={d.key}>
            <path d={`M ${x} ${d.top} V ${d.bottom}`} fill="none" strokeWidth={2} strokeLinecap="round" {...strokeProps(d.color)} />
            {d.points.map((p) => (
              <g key={p.id}>
                <path d={`M ${x} ${p.y} H ${x - STUB}`} fill="none" strokeWidth={1} {...strokeProps(d.color)} />
                <circle cx={x} cy={p.y} r={3.5} {...fillProps(d.color)} />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
