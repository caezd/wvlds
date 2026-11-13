"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { isRetiredStatus } from "@/lib/personaStatus";
import {
  ARC_R,
  CENTER,
  DEFAULT_TENSION,
  PLAYER_LABEL_R,
  RING_R,
  chordCurve,
  inwardLabel,
  labelWidth,
  outwardLabel,
  playerArcPath,
  polar,
  ringLabelPoint,
  spreadLabels,
  toPercent,
  type Edge,
  type RingLayout,
} from "./geometry";
import { EdgeLabels, PENDING_DASH, PlateEdge, edgeTypeLabel, type PlacedLabel, type PlateInteractions } from "./PlateParts";
import { NO_GROUP_RING, PersonaNode, tint } from "./PersonaNode";
import type { CPersona } from "./types";

/** Au-delà de ce nombre de personas, le cercle est « dense » : liens plus discrets. */
export const DENSE_FROM = 81;
/** Au-delà de ce nombre de joueurs, leurs noms ne viennent qu'à la demande. */
const PLAYER_NAMES_UP_TO = 16;
/** Au-delà de ce nombre d'étiquettes de type, on n'en montre aucune. */
const MAX_LABELS = 14;
/** Un nom de persona plus long est tronqué. */
const NAME_MAX = 17;

/**
 * La vue Cercle : tous les personas sur un cercle, regroupés par joueur sous
 * un arc ; les relations sont des cordes à l'intérieur. Survoler ou choisir
 * un persona (ou un joueur) isole ses liens et nomme ce qu'ils touchent.
 */
export function RingView({
  ring,
  personaMap,
  edges,
  ix,
  center,
  onActivatePersona,
  onOpenFocus,
  onActivatePlayer,
  onBackgroundClick,
}: {
  ring: RingLayout;
  personaMap: ReadonlyMap<string, CPersona>;
  /** Liens visibles, déjà fusionnés. */
  edges: Edge[];
  ix: PlateInteractions;
  /** Le texte posé au centre (survol, sélection), ou rien. */
  center: { title: string; sub: string } | null;
  onActivatePersona: (id: string, angle: number) => void;
  onOpenFocus: (id: string) => void;
  onActivatePlayer: (userId: string) => void;
  onBackgroundClick: () => void;
}) {
  const t = useTranslations("relations");
  const { angles, step, spacing } = ring;
  const dense = angles.size >= DENSE_FROM;
  const owner = (id: string) => personaMap.get(id)?.user_id;

  // Ce qu'on regarde : un persona (survolé, sinon choisi), à défaut un joueur.
  const fp = ix.hoverPersonaId ?? ix.selectedPersonaId;
  const fu = fp ? null : ix.hoverUserId ?? ix.selectedUserId;
  const touches = (e: Edge) => fp
    ? e.from === fp || e.to === fp
    : fu ? owner(e.from) === fu || owner(e.to) === fu : false;
  const hoveredEdge = ix.hoverRelationId ? edges.find((e) => e.rels.some((r) => r.id === ix.hoverRelationId)) : undefined;
  const focusing = !!(fp || fu || ix.hoverRelationId);

  const shown = edges.filter((e) => angles.has(e.from) && angles.has(e.to));
  const adjacent = new Set<string>();
  for (const e of shown) if (touches(e)) { adjacent.add(e.from); adjacent.add(e.to); }
  if (hoveredEdge) { adjacent.add(hoveredEdge.from); adjacent.add(hoveredEdge.to); }

  const adjColor = new Map<string, string>();
  const labels: Array<PlacedLabel & { w: number }> = [];
  const drawn = shown.map((e) => {
    const meta = ix.typeOf(e.type);
    const curve = chordCurve(angles.get(e.from)!, angles.get(e.to)!, DEFAULT_TENSION);
    const active = e === hoveredEdge || touches(e);
    let opacity = dense ? (e.pending ? 0.14 : 0.18) : e.pending ? 0.4 : 0.5;
    if (focusing) opacity = active ? 1 : dense ? 0.03 : 0.05;
    const from = personaMap.get(e.from), to = personaMap.get(e.to);
    if (ix.query && !(from && ix.matches(from)) && !(to && ix.matches(to))) opacity = Math.min(opacity, 0.05);
    if (fp && touches(e) && !ix.query) {
      adjColor.set(e.from === fp ? e.to : e.from, meta.color);
      const at = ringLabelPoint(curve, e.from === fp);
      const text = edgeTypeLabel(meta, e.pending, t("pending"));
      labels.push({ key: e.id, ...at, w: labelWidth(text), text, color: meta.color });
    }
    return (
      <PlateEdge
        key={e.id}
        edge={e}
        curve={curve}
        color={meta.color}
        dash={e.pending ? PENDING_DASH : meta.dash || undefined}
        width={active ? 2 : 1.1}
        opacity={opacity}
        arrow={e.directed ? (active ? { length: 9, halfWidth: 4.2 } : { length: 7, halfWidth: 3.4 }) : null}
        zoom={ix.zoom}
        onHover={ix.onEdgeHover}
      />
    );
  });
  const placedLabels = labels.length > MAX_LABELS ? [] : spreadLabels(labels);

  return (
    <>
      <svg viewBox="0 0 900 900" className="absolute inset-0 block size-full overflow-visible">
        <rect
          x={0}
          y={0}
          width={900}
          height={900}
          fill="transparent"
          onClick={() => { if (!ix.wasDragged()) onBackgroundClick(); }}
        />
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={ARC_R}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          style={{ fill: tint("var(--foreground)", 2), stroke: "var(--border)" }}
        />
        {drawn}
        {ring.arcs.map((arc) => {
          const on = fu === arc.userId || (!!fp && owner(fp) === arc.userId);
          const handle = ix.handleOf(arc.userId);
          const d = playerArcPath(arc, step);
          return (
            <g
              key={arc.userId}
              role="button"
              tabIndex={0}
              aria-label={handle}
              aria-pressed={ix.selectedUserId === arc.userId && !ix.selectedPersonaId}
              data-player-arc={arc.userId}
              className="cursor-pointer outline-none"
              onMouseEnter={() => ix.onHoverUser(arc.userId)}
              onMouseLeave={() => ix.onHoverUser(null)}
              onClick={(e) => { e.stopPropagation(); if (!ix.wasDragged()) onActivatePlayer(arc.userId); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivatePlayer(arc.userId); } }}
            >
              <path d={d} fill="none" stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" />
              <path
                d={d}
                fill="none"
                strokeWidth={on ? 3.5 : 2.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className={cn("transition-[stroke] duration-200", on ? "stroke-primary" : "stroke-zinc-700")}
              />
            </g>
          );
        })}
      </svg>

      {/* Les noms des joueurs, au milieu de leur arc, tournés vers le centre. */}
      {ring.arcs.map((arc) => {
        const on = fu === arc.userId || (!!fp && owner(fp) === arc.userId);
        const l = inwardLabel(arc.mid, PLAYER_LABEL_R);
        return (
          <span
            key={arc.userId}
            aria-hidden
            className={cn(
              "pointer-events-none absolute max-w-[11cqw] truncate whitespace-nowrap font-semibold tracking-[.02em] transition-[opacity,color] duration-200",
              on ? "text-foreground" : "text-muted-foreground",
            )}
            style={{
              left: `${l.left}%`,
              top: `${l.top}%`,
              transform: l.transform,
              transformOrigin: l.origin,
              fontSize: "clamp(9px, 1.25cqw, 12px)",
              textShadow: "0 0 3px var(--background), 0 0 6px var(--background)",
              opacity: ring.arcs.length <= PLAYER_NAMES_UP_TO || on || ix.zoom >= 1.5 ? 1 : 0,
            }}
          >
            {ix.handleOf(arc.userId)}
          </span>
        );
      })}

      {[...angles].map(([id, angle]) => {
        const p = personaMap.get(id);
        if (!p) return null;
        const g = ix.groupColorOf(id);
        const isF = id === fp, isSel = id === ix.selectedPersonaId, near = adjacent.has(id);
        const hovered = id === ix.hoverPersonaId;
        const inU = !!fu && p.user_id === fu;
        const big = isF || isSel;
        let opacity = 1;
        if (focusing && !isF && !near && !inU) opacity = 0.35;
        if (ix.query && !ix.matches(p)) opacity = 0.2;
        const linkColor = adjColor.get(id);
        const ringShadow = isSel
          ? "0 0 0 2px var(--background), 0 0 0 3.5px var(--foreground)"
          : linkColor
            ? `inset 0 0 0 2px ${linkColor}, 0 0 0 2px var(--background), 0 0 10px ${tint(linkColor, 40)}`
            : `inset 0 0 0 1.5px ${g ?? NO_GROUP_RING}, 0 0 0 2px var(--background)`;
        const at = toPercent(polar(angle, RING_R));
        return (
          <PersonaNode
            key={id}
            persona={p}
            groupColor={g}
            left={at.left}
            top={at.top}
            size={big ? 2.7 : hovered ? 2.4 : Math.min(2.05, spacing * 0.88)}
            fontSize={big ? 0.95 : Math.min(0.72, spacing * 0.32)}
            ring={ringShadow}
            opacity={opacity}
            selected={isSel}
            title={t("dblClickHint")}
            onActivate={() => { if (!ix.wasDragged()) onActivatePersona(id, angle); }}
            onDoubleActivate={() => onOpenFocus(id)}
            onHover={(h) => ix.onHoverPersona(h ? id : null)}
          />
        );
      })}

      {/* Les noms des personas, vers l'extérieur ; tous si la place le permet. */}
      {[...angles].map(([id, angle]) => {
        const p = personaMap.get(id);
        if (!p) return null;
        const isF = id === fp, isSel = id === ix.selectedPersonaId, near = adjacent.has(id);
        const inU = !!fu && p.user_id === fu;
        const big = isF || isSel;
        const retired = isRetiredStatus(p.narrative_status);
        const show = spacing >= 1.5 || ix.zoom >= 1.6 || big || near || inU || (!!ix.query && ix.matches(p));
        const l = outwardLabel(angle, RING_R + (big ? 14 + 9 : 11 + 6));
        const size = big ? Math.max(1.2, Math.min(1.33, spacing * 0.62)) : Math.min(1.33, spacing * 0.62);
        return (
          <span
            key={id}
            aria-hidden
            data-persona-label={id}
            className={cn(
              "pointer-events-none absolute whitespace-nowrap leading-none transition-[opacity,color] duration-200",
              big ? "font-semibold" : "font-medium",
              big || near || inU ? "text-foreground" : "text-muted-foreground",
              retired && "italic",
            )}
            style={{
              left: `${l.left}%`,
              top: `${l.top}%`,
              transform: l.transform,
              transformOrigin: l.origin,
              fontSize: `clamp(8px, ${size.toFixed(2)}cqw, 13px)`,
              textShadow: "0 0 3px var(--background), 0 0 5px var(--background)",
              opacity: show ? 1 : 0,
            }}
          >
            {p.name.length > NAME_MAX ? `${p.name.slice(0, NAME_MAX - 1)}…` : p.name}
          </span>
        );
      })}

      <EdgeLabels labels={placedLabels} />

      {center && (
        <div
          data-ring-center
          className="pointer-events-none absolute left-1/2 top-1/2 flex max-w-[40%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[3px] rounded-lg bg-background/90 px-3.5 py-2 text-center ring-1 ring-border"
        >
          <span className="max-w-full truncate font-semibold text-foreground" style={{ fontSize: "clamp(14px, 2.2cqw, 22px)" }}>
            {center.title}
          </span>
          <span className="text-muted-foreground" style={{ fontSize: "clamp(11px, 1.35cqw, 13px)" }}>{center.sub}</span>
        </div>
      )}
    </>
  );
}
