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

type Point = { id: string; y: number; pending: boolean };
/** Un tronçon du trait vertical, entre deux salons voisins de la chaîne. */
type Segment = { top: number; bottom: number; pending: boolean };
type Drawn = {
  key: string;
  points: Point[];
  segments: Segment[];
  top: number;
  bottom: number;
  lane: number;
  color: string | null;
};

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
 * Au survol seulement (`only` non nul), une seule chaîne est tracée à la
 * fois : un seul couloir est réservé (`onLanes`), et la chaîne survolée s'y
 * dessine. La place ne dépend donc pas du survol, et les titres ne bougent
 * pas quand une chaîne s'allume.
 */
export function SuiteLinks({
  containerRef,
  links,
  style,
  only,
  thread = null,
  version,
  onLanes,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  links: SuiteLink[];
  style: SuiteStyle;
  /** Au survol seulement : les salons de la chaîne à tracer ; `null` pour toutes. */
  only: ReadonlySet<string> | null;
  /**
   * Le fil d'un persona : ses salons et ses entrées de journal, que le fil
   * de la frise relie, de la première à la dernière, dans sa couleur.
   */
  thread?: { ids: readonly string[]; color: string | null } | null;
  /** Change quand la frise change (filtres, données) : force une mesure. */
  version: string;
  onLanes: (count: number) => void;
}) {
  const [drawn, setDrawn] = React.useState<Drawn[]>([]);
  const [box, setBox] = React.useState({ width: 0, filX: 0 });
  const [threadYs, setThreadYs] = React.useState<{ id: string; y: number }[]>([]);
  const hoverMode = only !== null;

  const measure = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const yOf = (id: string) => {
      const el = container.querySelector<HTMLElement>(`[data-room-id="${id}"], [data-journal-id="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.top - rect.top + Math.min(r.height, 20) / 2;
    };
    // Le fil : le centre d'un anneau de salon.
    const ring = container.querySelector<HTMLElement>("[data-room-id] [data-testid='timeline-ring']");
    const ringRect = ring?.getBoundingClientRect();
    const filX = ringRect ? ringRect.left - rect.left + ringRect.width / 2 : 0;

    // Les chaînes ne se forment que des liens acceptés, en traits pleins.
    // Une suite proposée se trace à part, dans son propre couloir et en
    // pointillés : fondue dans une chaîne, elle disparaissait sous son trait
    // plein dès que ses deux salons y étaient déjà. Elle prend la couleur de
    // la chaîne qu'elle rejoint (la suite d'abord, puis le salon précédent).
    const solid = (ids: string[]) => {
      const points = ids
        .map((id) => ({ id, y: yOf(id), pending: false }))
        .filter((p): p is Point => p.y !== null)
        .sort((a, b) => a.y - b.y);
      const segments: Segment[] = points.slice(1).map((p, i) => ({ top: points[i].y, bottom: p.y, pending: false }));
      return { points, segments };
    };
    const accepted = buildSuiteChains(links.filter((l) => !l.pending));
    const chainColor = (id: string) => accepted.find((c) => c.ids.includes(id))?.color ?? null;
    const chains = [
      ...accepted.map((c) => ({ color: c.color, ...solid(c.ids) })),
      ...links
        .filter((l) => l.pending)
        .map((l) => {
          const { points } = solid([l.from, l.to]);
          const dashed = points.map((p) => ({ ...p, pending: true }));
          return {
            color: chainColor(l.to) ?? chainColor(l.from) ?? l.color,
            points: dashed,
            segments: dashed.length > 1 ? [{ top: dashed[0].y, bottom: dashed[1].y, pending: true }] : [],
          };
        }),
    ].filter((c) => c.points.length > 1);
    const spans = chains.map((c) => ({
      top: Math.min(...c.points.map((p) => p.y)),
      bottom: Math.max(...c.points.map((p) => p.y)),
    }));
    const lanes = assignSuiteLanes(spans);
    setDrawn(chains.map((c, i) => ({
      key: c.points.map((p) => p.id).join(">"),
      points: c.points,
      segments: c.segments,
      top: spans[i].top,
      bottom: spans[i].bottom,
      lane: lanes[i],
      color: c.color,
    })));
    setBox({ width: rect.width, filX });
    setThreadYs(
      (thread?.ids ?? [])
        .map((id) => ({ id, y: yOf(id) }))
        .filter((p): p is { id: string; y: number } => p.y !== null)
        .sort((a, b) => a.y - b.y),
    );
    onLanes(chains.length === 0 ? 0 : hoverMode ? 1 : Math.max(...lanes) + 1);
  }, [containerRef, links, onLanes, hoverMode, thread]);

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

  // Au survol, la chaîne allumée prend l'unique couloir réservé.
  const shown = only
    ? drawn.filter((d) => d.points.some((p) => only.has(p.id))).map((d) => ({ ...d, lane: 0 }))
    : drawn;
  if (shown.length === 0 && threadYs.length === 0) return null;
  const gap = LANE_GAP[style];
  const strokeProps = (color: string | null, pending = false) => ({
    className: color ? undefined : "stroke-foreground/30",
    style: color ? { stroke: color, opacity: 0.85 } : undefined,
    strokeDasharray: pending ? "3 3" : undefined,
    "data-pending": pending ? "" : undefined,
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
      {/* Le fil du persona filtré : le fil de la frise se colore, de son
          premier à son dernier passage, et chacun d'eux se marque d'un point. */}
      {threadYs.length > 0 && (
        <g data-testid="timeline-persona-thread">
          {threadYs.length > 1 && (
            <path
              d={`M ${box.filX} ${threadYs[0].y} V ${threadYs[threadYs.length - 1].y}`}
              fill="none"
              strokeWidth={3}
              strokeLinecap="round"
              className={thread?.color ? undefined : "stroke-foreground/70"}
              style={thread?.color ? { stroke: thread.color, opacity: 0.8 } : undefined}
            />
          )}
          {threadYs.map((p) => (
            <circle
              key={p.id}
              cx={box.filX}
              cy={p.y}
              r={4.5}
              data-thread-point={p.id}
              className={thread?.color ? undefined : "fill-foreground"}
              style={thread?.color ? { fill: thread.color } : undefined}
            />
          ))}
        </g>
      )}
      {shown.map((d) => {
        if (style === "graph") {
          // Un couloir entre le fil et les titres ; chaque anneau s'y branche.
          const x = box.filX + GRAPH_OFFSET + d.lane * gap;
          return (
            <g key={d.key} data-suite={d.key} data-pending-link={d.points.every((p) => p.pending) || undefined}>
              {d.segments.map((s) => (
                <path key={`${s.top}-${s.bottom}`} d={`M ${x} ${s.top} V ${s.bottom}`} fill="none" strokeWidth={1.5} {...strokeProps(d.color, s.pending)} />
              ))}
              {d.points.map((p) => (
                <g key={p.id}>
                  <path d={`M ${x} ${p.y} H ${box.filX + 7}`} fill="none" strokeWidth={1.5} {...strokeProps(d.color, p.pending)} />
                  <circle cx={x} cy={p.y} r={2.5} {...fillProps(d.color)} />
                </g>
              ))}
            </g>
          );
        }
        // Un rail dans la marge droite, une pastille par salon.
        const x = box.width - EDGE - d.lane * gap;
        return (
          <g key={d.key} data-suite={d.key} data-pending-link={d.points.every((p) => p.pending) || undefined}>
            {d.segments.map((s) => (
              <path key={`${s.top}-${s.bottom}`} d={`M ${x} ${s.top} V ${s.bottom}`} fill="none" strokeWidth={2} strokeLinecap={s.pending ? "butt" : "round"} {...strokeProps(d.color, s.pending)} />
            ))}
            {d.points.map((p) => (
              <g key={p.id}>
                <path d={`M ${x} ${p.y} H ${x - STUB}`} fill="none" strokeWidth={1} {...strokeProps(d.color, p.pending)} />
                <circle cx={x} cy={p.y} r={3.5} {...fillProps(d.color)} />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
