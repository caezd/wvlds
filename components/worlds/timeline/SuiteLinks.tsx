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
 *             branche — façon historique git ;
 * - `hover` : rien au repos ; la chaîne du salon survolé s'allume, une
 *             accolade par paire.
 * Indépendamment du style, `dashed` passe les traits en pointillés et fléche
 * chaque salon qui est une suite.
 */
export type SuiteStyle = "rail" | "graph" | "hover";
export const SUITE_STYLES: readonly SuiteStyle[] = ["rail", "graph", "hover"];

type Point = { id: string; y: number };
type Drawn =
  | { kind: "pair"; key: string; top: number; bottom: number; toY: number; lane: number; color: string | null }
  | { kind: "chain"; key: string; points: Point[]; top: number; bottom: number; lane: number; color: string | null };

const EDGE = 12;
const STUB = 14;
const RADIUS = 6;
/** Écart entre couloirs, par style. */
const LANE_GAP: Record<SuiteStyle, number> = { rail: 10, graph: 8, hover: 10 };
/** Distance entre le fil et le premier couloir du graphe. */
export const GRAPH_OFFSET = 14;

/**
 * Le calque des lignes de suite. Les positions se mesurent dans le DOM
 * (`[data-room-id]`, et l'anneau d'un salon pour le graphe), à chaque
 * changement de la frise et de la taille du conteneur. `onLanes` donne le
 * nombre de couloirs, pour que la frise leur laisse la place.
 */
export function SuiteLinks({
  containerRef,
  links,
  style,
  dashed = false,
  version,
  onLanes,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  links: SuiteLink[];
  style: SuiteStyle;
  /** Traits pointillés, et une flèche vers chaque salon qui est une suite. */
  dashed?: boolean;
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

    let next: Drawn[] = [];
    if (style === "rail" || style === "graph") {
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
      next = chains.map((c, i) => ({
        kind: "chain",
        key: c.points.map((p) => p.id).join(">"),
        points: c.points,
        top: spans[i].top,
        bottom: spans[i].bottom,
        lane: lanes[i],
        color: c.color,
      }));
    } else {
      const pairs: { key: string; top: number; bottom: number; toY: number; color: string | null }[] = [];
      for (const link of links) {
        const a = yOf(link.from);
        const b = yOf(link.to);
        if (a === null || b === null) continue;
        pairs.push({ key: `${link.from}>${link.to}`, top: Math.min(a, b), bottom: Math.max(a, b), toY: b, color: link.color });
      }
      const lanes = assignSuiteLanes(pairs);
      next = pairs.map((p, i) => ({ kind: "pair", ...p, lane: lanes[i] }));
    }
    setDrawn(next);
    setBox({ width: rect.width, filX });
    onLanes(next.length ? Math.max(...next.map((d) => d.lane)) + 1 : 0);
  }, [containerRef, links, style, onLanes]);

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
  const gap = LANE_GAP[style];
  // Les salons qui sont une suite : eux reçoivent la flèche.
  const suites = new Set(links.map((l) => l.to));
  const dash = dashed ? "3 3" : undefined;
  const arrowTo = (id: string) => (dashed && suites.has(id) ? "url(#suite-arrow)" : undefined);
  const strokeProps = (color: string | null) => ({
    className: color ? undefined : "stroke-foreground/30",
    style: color ? { stroke: color, opacity: 0.85 } : undefined,
    strokeDasharray: dash,
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
      data-dashed={dashed || undefined}
    >
      {dashed && (
        <defs>
          {/* Une pointe dans le sens du trait : chaque trait fléché finit sur la suite. */}
          <marker id="suite-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 z" className="fill-foreground/60" />
          </marker>
        </defs>
      )}
      {drawn.map((d) => {
        if (d.kind === "chain" && style === "graph") {
          // Un couloir entre le fil et les titres ; chaque anneau s'y branche.
          const x = box.filX + GRAPH_OFFSET + d.lane * gap;
          return (
            <g key={d.key} data-suite={d.key}>
              <path d={`M ${x} ${d.top} V ${d.bottom}`} fill="none" strokeWidth={1.5} {...strokeProps(d.color)} />
              {d.points.map((p) => (
                <g key={p.id}>
                  {/* Du couloir vers l'anneau : la flèche, s'il y en a une, y aboutit. */}
                  <path
                    d={`M ${x} ${p.y} H ${box.filX + 7}`}
                    fill="none"
                    strokeWidth={1.5}
                    markerEnd={arrowTo(p.id)}
                    data-arrow={arrowTo(p.id) ? "" : undefined}
                    {...strokeProps(d.color)}
                  />
                  <circle cx={x} cy={p.y} r={2.5} {...fillProps(d.color)} />
                </g>
              ))}
            </g>
          );
        }
        if (d.kind === "chain") {
          // Un rail dans la marge droite, une pastille par salon.
          const x = box.width - EDGE - d.lane * gap;
          return (
            <g key={d.key} data-suite={d.key}>
              <path d={`M ${x} ${d.top} V ${d.bottom}`} fill="none" strokeWidth={2} strokeLinecap="round" {...strokeProps(d.color)} />
              {d.points.map((p) => (
                <g key={p.id}>
                  {/* Du rail vers le salon : la flèche, s'il y en a une, y aboutit. */}
                  <path
                    d={`M ${x} ${p.y} H ${x - STUB}`}
                    fill="none"
                    strokeWidth={1}
                    markerEnd={arrowTo(p.id)}
                    data-arrow={arrowTo(p.id) ? "" : undefined}
                    {...strokeProps(d.color)}
                  />
                  <circle cx={x} cy={p.y} r={3.5} {...fillProps(d.color)} />
                </g>
              ))}
            </g>
          );
        }
        // Une accolade par paire (survol) ; pointillée, elle finit fléchée sur la suite.
        const x = box.width - EDGE - d.lane * gap;
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
        // La flèche pointe vers la suite : le chemin doit finir sur elle.
        const endsOnSuite = d.toY === d.bottom;
        const reversed = [
          `M ${x0} ${d.bottom}`,
          `H ${x - r}`,
          `Q ${x} ${d.bottom} ${x} ${d.bottom - r}`,
          `V ${d.top + r}`,
          `Q ${x} ${d.top} ${x - r} ${d.top}`,
          `H ${x0}`,
        ].join(" ");
        return (
          <path
            key={d.key}
            d={dashed && !endsOnSuite ? reversed : path}
            data-suite={d.key}
            fill="none"
            strokeWidth={dashed ? 1 : 1.5}
            markerEnd={dashed ? "url(#suite-arrow)" : undefined}
            {...strokeProps(d.color)}
          />
        );
      })}
    </svg>
  );
}
