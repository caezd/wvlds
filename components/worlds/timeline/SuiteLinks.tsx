"use client";

import * as React from "react";
import { assignSuiteLanes, buildSuiteChains, isSuiteBridge, suiteChainOf, type SuitePair } from "@/lib/worldTimelineItems";

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
  /** Passerelle entre deux arcs : le salon quitté et la couleur de son arc. */
  bridge?: { fromId: string; fromColor: string | null };
  /** Le fil d'un persona, pas une chaîne de suites. */
  thread?: boolean;
};

const EDGE = 12;
const STUB = 14;
/** Écart entre couloirs, par style. */
const LANE_GAP: Record<SuiteStyle, number> = { rail: 10, graph: 8 };
/** Distance entre le fil et le premier couloir du graphe. */
export const GRAPH_OFFSET = 14;

/** Au survol : les tracés allumés, rangés dans les couloirs dès `offset`. */
function litLanes(drawn: Drawn[], only: ReadonlySet<string>, offset: number): Drawn[] {
  const lit = drawn.filter((d) => !d.thread && d.points.some((p) => only.has(p.id)));
  const lanes = assignSuiteLanes(lit);
  return [
    ...drawn.filter((d) => d.thread),
    ...lit.map((d, i) => ({ ...d, lane: lanes[i] + offset })),
  ];
}

/**
 * Le calque des lignes de suite. Les positions se mesurent dans le DOM
 * (`[data-room-id]`, `[data-journal-id]`, et l'anneau d'un salon pour le
 * graphe), à chaque changement de la frise et de la taille du conteneur.
 *
 * Le fil d'un persona se dessine comme une chaîne, dans le style choisi,
 * toujours dans le premier couloir : les suites viennent après lui.
 *
 * Une suite entre deux arcs est une passerelle : elle ne fond pas les deux
 * arcs en une chaîne, et se trace à part, en fondu d'une couleur à l'autre.
 *
 * Au survol seulement (`only` non nul), une seule chaîne de suites est
 * tracée à la fois, avec ses passerelles : on réserve les couloirs du survol
 * le plus chargé (`onLanes`), souvent un seul. La place ne dépend donc pas
 * du survol, et les titres ne bougent pas quand une chaîne s'allume.
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
  /** Le fil d'un persona : ses salons et ses entrées de journal, dans sa couleur. */
  thread?: { ids: readonly string[]; color: string | null } | null;
  /** Change quand la frise change (filtres, données) : force une mesure. */
  version: string;
  onLanes: (count: number) => void;
}) {
  const [drawn, setDrawn] = React.useState<Drawn[]>([]);
  const [box, setBox] = React.useState({ width: 0, filX: 0 });
  const hoverMode = only !== null;
  const uid = React.useId();

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

    const solid = (ids: readonly string[]) => {
      const points = ids
        .map((id) => ({ id, y: yOf(id), pending: false }))
        .filter((p): p is Point => p.y !== null)
        .sort((a, b) => a.y - b.y);
      const segments: Segment[] = points.slice(1).map((p, i) => ({ top: points[i].y, bottom: p.y, pending: false }));
      return { points, segments };
    };
    const span = (points: Point[]) => ({
      top: Math.min(...points.map((p) => p.y)),
      bottom: Math.max(...points.map((p) => p.y)),
    });

    // Les chaînes ne se forment que des liens acceptés, en traits pleins.
    // Une suite proposée se trace à part, dans son propre couloir et en
    // pointillés : fondue dans une chaîne, elle disparaissait sous son trait
    // plein dès que ses deux salons y étaient déjà. Elle prend la couleur de
    // la chaîne qu'elle rejoint (la suite d'abord, puis le salon précédent).
    // Une passerelle entre deux arcs se trace aussi à part, en fondu de la
    // couleur de l'arc quitté à celle de l'arc rejoint.
    const accepted = buildSuiteChains(links.filter((l) => !l.pending));
    const chainColor = (id: string) => accepted.find((c) => c.ids.includes(id))?.color ?? null;
    const chains: { color: string | null; bridge?: Drawn["bridge"]; points: Point[]; segments: Segment[] }[] = [
      ...accepted.map((c) => ({ color: c.color, ...solid(c.ids) })),
      ...links
        .filter((l) => l.pending || isSuiteBridge(l))
        .map((l) => {
          const pending = !!l.pending;
          const pair = solid([l.from, l.to]).points.map((p) => ({ ...p, pending }));
          return {
            color: isSuiteBridge(l) ? l.color : chainColor(l.to) ?? chainColor(l.from) ?? l.color,
            bridge: isSuiteBridge(l) ? { fromId: l.from, fromColor: l.bridgeFrom ?? null } : undefined,
            points: pair,
            segments: pair.length > 1 ? [{ top: pair[0].y, bottom: pair[1].y, pending }] : [],
          };
        }),
    ].filter((c) => c.points.length > 1);

    // Le fil du persona : le premier couloir ; les suites se rangent après.
    const threadChain = thread ? solid(thread.ids) : null;
    const hasThread = !!threadChain && threadChain.points.length > 0;
    const spans = chains.map((c) => span(c.points));
    const lanes = assignSuiteLanes(spans).map((l) => l + (hasThread ? 1 : 0));

    const next: Drawn[] = chains.map((c, i) => ({
      key: c.points.map((p) => p.id).join(">"),
      points: c.points,
      segments: c.segments,
      ...spans[i],
      lane: lanes[i],
      color: c.color,
      bridge: c.bridge,
    }));
    if (hasThread) {
      next.unshift({
        key: "persona-thread",
        points: threadChain.points,
        segments: threadChain.segments,
        ...span(threadChain.points),
        lane: 0,
        color: thread!.color,
        thread: true,
      });
    }
    setDrawn(next);
    setBox({ width: rect.width, filX });
    // Au survol, la place réservée est celle du survol le plus chargé : la
    // chaîne d'un arc et les passerelles qui en partent se chevauchent.
    const laneCount = (items: { top: number; bottom: number }[]) =>
      items.length === 0 ? 0 : Math.max(...assignSuiteLanes(items)) + 1;
    const suiteLanes = !hoverMode
      ? laneCount(spans)
      : Math.max(0, ...[...new Set(chains.flatMap((c) => c.points.map((p) => p.id)))].map((id) => {
          const lit = suiteChainOf(links, id) ?? new Set([id]);
          return laneCount(chains.filter((c) => c.points.some((p) => lit.has(p.id))).map((c) => span(c.points)));
        }));
    onLanes(suiteLanes + (hasThread ? 1 : 0));
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

  // Au survol, la chaîne allumée (et ses passerelles) se range dans les
  // couloirs réservés aux suites, après celui du fil de persona, toujours tracé.
  const hasThread = drawn.some((d) => d.thread);
  const shown = only ? litLanes(drawn, only, hasThread ? 1 : 0) : drawn;
  if (shown.length === 0) return null;
  const gap = LANE_GAP[style];
  // Une passerelle entre arcs : chaque bout dans la couleur de son arc, et
  // le tronc en fondu de l'un à l'autre (dégradé en coordonnées de la frise :
  // un trait vertical n'a pas de largeur, un dégradé relatif à sa boîte ne
  // s'afficherait pas).
  const colorAt = (d: Drawn, id: string) => (d.bridge && id === d.bridge.fromId ? d.bridge.fromColor : d.color);
  const gradientId = (d: Drawn) => `${uid}-bridge-${d.key}`.replace(/[^A-Za-z0-9_-]/g, "_");
  const trunkPaint = (d: Drawn) => (d.bridge?.fromColor && d.color ? `url(#${gradientId(d)})` : d.color);
  const bridgeGradient = (d: Drawn, x: number) => {
    if (!d.bridge?.fromColor || !d.color) return null;
    const fromY = d.points.find((p) => p.id === d.bridge!.fromId)?.y ?? d.top;
    const toY = d.points.find((p) => p.id !== d.bridge!.fromId)?.y ?? d.bottom;
    return (
      <defs>
        <linearGradient id={gradientId(d)} gradientUnits="userSpaceOnUse" x1={x} y1={fromY} x2={x} y2={toY}>
          <stop offset="0" stopColor={d.bridge.fromColor} />
          <stop offset="1" stopColor={d.color} />
        </linearGradient>
      </defs>
    );
  };
  const strokeProps = (d: Drawn, pending = false, color = d.color) => ({
    className: color ? undefined : d.thread ? "stroke-foreground/70" : "stroke-foreground/30",
    style: color ? { stroke: color, opacity: d.thread ? 1 : 0.85 } : undefined,
    strokeDasharray: pending ? "3 3" : undefined,
    "data-pending": pending ? "" : undefined,
  });
  const fillProps = (d: Drawn, color = d.color) => ({
    className: color ? undefined : d.thread ? "fill-foreground" : "fill-foreground/40",
    style: color ? { fill: color } : undefined,
  });
  const groupProps = (d: Drawn) => ({
    "data-suite": d.thread ? undefined : d.key,
    "data-testid": d.thread ? "timeline-persona-thread" : undefined,
    "data-pending-link": (!d.thread && d.points.every((p) => p.pending)) || undefined,
    "data-bridge": d.bridge ? "" : undefined,
  });

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden
      data-testid="timeline-suite-links"
      data-style={style}
    >
      {shown.map((d) => {
        // Le fil d'un persona, un peu plus appuyé que les suites.
        const weight = d.thread ? 1 : 0;
        if (style === "graph") {
          // Un couloir entre le fil et les titres ; chaque anneau s'y branche.
          const x = box.filX + GRAPH_OFFSET + d.lane * gap;
          return (
            <g key={d.key} {...groupProps(d)} data-lane={d.lane}>
              {bridgeGradient(d, x)}
              {d.segments.map((s) => (
                <path key={`${s.top}-${s.bottom}`} d={`M ${x} ${s.top} V ${s.bottom}`} fill="none" strokeWidth={1.5 + weight} {...strokeProps(d, s.pending, trunkPaint(d))} />
              ))}
              {d.points.map((p) => (
                <g key={p.id}>
                  <path d={`M ${x} ${p.y} H ${box.filX + 7}`} fill="none" strokeWidth={1.5} {...strokeProps(d, p.pending, colorAt(d, p.id))} />
                  <circle cx={x} cy={p.y} r={2.5 + weight} data-thread-point={d.thread ? p.id : undefined} {...fillProps(d, colorAt(d, p.id))} />
                </g>
              ))}
            </g>
          );
        }
        // Un rail dans la marge droite, une pastille par salon.
        const x = box.width - EDGE - d.lane * gap;
        return (
          <g key={d.key} {...groupProps(d)} data-lane={d.lane}>
            {bridgeGradient(d, x)}
            {d.segments.map((s) => (
              <path key={`${s.top}-${s.bottom}`} d={`M ${x} ${s.top} V ${s.bottom}`} fill="none" strokeWidth={2 + weight} strokeLinecap={s.pending ? "butt" : "round"} {...strokeProps(d, s.pending, trunkPaint(d))} />
            ))}
            {d.points.map((p) => (
              <g key={p.id}>
                <path d={`M ${x} ${p.y} H ${x - STUB}`} fill="none" strokeWidth={1} {...strokeProps(d, p.pending, colorAt(d, p.id))} />
                <circle cx={x} cy={p.y} r={3.5 + weight} data-thread-point={d.thread ? p.id : undefined} {...fillProps(d, colorAt(d, p.id))} />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
