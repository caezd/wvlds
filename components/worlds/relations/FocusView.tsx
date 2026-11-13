"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import {
  CENTER,
  FOCUS_SIZES,
  avatarRadius,
  focusCurve,
  focusLabelPoint,
  focusLayout,
  labelWidth,
  pairOffsets,
  spreadLabels,
  toPercent,
  type Edge,
} from "./geometry";
import { EdgeLabels, PENDING_DASH, PlateEdge, edgeTypeLabel, type PlacedLabel, type PlateInteractions } from "./PlateParts";
import { NO_GROUP_RING, PersonaNode, tint } from "./PersonaNode";
import type { CPersona } from "./types";

/** Au-delà de ce nombre d'étiquettes de type, on n'en montre aucune. */
const MAX_LABELS = 20;
/** Trait des liens du second anneau : un jeton, passé en style. */
const SECOND_STROKE = "var(--muted-foreground)";

/**
 * La vue Centré : un persona au centre, ses relations directes sur un
 * premier anneau, celles de second degré sur un second. Un clic sur un
 * persona l'amène au centre.
 */
export function FocusView({
  focusId,
  personaMap,
  edges,
  typeOrder,
  ix,
  statusOf,
  onRecenter,
  showSecond = true,
}: {
  focusId: string;
  personaMap: ReadonlyMap<string, CPersona>;
  /** Liens visibles, déjà fusionnés. */
  edges: Edge[];
  typeOrder: ReadonlyMap<string, number>;
  ix: PlateInteractions;
  /** Libellé du statut narratif d'un persona. */
  statusOf: (persona: CPersona) => string;
  onRecenter: (id: string) => void;
  /** Montrer le second anneau (relations des relations). */
  showSecond?: boolean;
}) {
  const t = useTranslations("relations");
  const full = React.useMemo(() => focusLayout(focusId, edges, typeOrder), [focusId, edges, typeOrder]);
  // Sans le second anneau : ni ses personas, ni ses liens, ni son cercle.
  const layout = React.useMemo(() => {
    if (showSecond) return full;
    const pos = new Map([...full.pos].filter(([id]) => !full.parentOf.has(id)));
    return { ...full, pos, r2: null, edges: full.edges.filter((e) => !e.second) };
  }, [full, showSecond]);
  const { pos, sizes, angles, r1, r2 } = layout;

  const hf = ix.hoverPersonaId && pos.has(ix.hoverPersonaId) ? ix.hoverPersonaId : null;
  const linked = (a: string, b: string) => layout.edges.some(({ edge: e }) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
  const offsets = pairOffsets(layout.edges.filter((e) => !e.second).map((e) => e.edge));

  const labels: Array<PlacedLabel & { w: number }> = [];
  const drawn = layout.edges.map(({ edge: e, second }) => {
    const meta = ix.typeOf(e.type);
    const a = pos.get(e.from)!, b = pos.get(e.to)!;
    const curve = focusCurve(a, b, avatarRadius(sizes.get(e.from)!), avatarRadius(sizes.get(e.to)!), second ? 0 : offsets.get(e.id) ?? 0);
    const hovered = !!ix.hoverRelationId && e.rels.some((r) => r.id === ix.hoverRelationId);
    const active = hf ? e.from === hf || e.to === hf : false;
    let opacity = second ? 0.3 : e.pending ? 0.55 : 0.85;
    if (hf || ix.hoverRelationId) opacity = active || hovered ? 1 : 0.07;
    if (!second && opacity > 0.5 && r1) {
      const other = e.from === focusId ? e.to : e.from;
      const at = focusLabelPoint(curve, e.from === focusId, angles.get(other) ?? 0, r1);
      const text = edgeTypeLabel(meta, e.pending, t("pending"));
      labels.push({ key: e.id, ...at, w: labelWidth(text), text, color: meta.color });
    }
    return (
      <PlateEdge
        key={e.id}
        edge={e}
        curve={curve}
        color={second ? SECOND_STROKE : meta.color}
        dash={e.pending ? PENDING_DASH : meta.dash || undefined}
        width={second ? 1 : active || hovered ? 2.6 : 1.8}
        opacity={opacity}
        arrow={e.directed ? (second ? { length: 6, halfWidth: 3 } : { length: 9, halfWidth: 4.2 }) : null}
        zoom={ix.zoom}
        onHover={ix.onEdgeHover}
      />
    );
  });
  const placedLabels = labels.length > MAX_LABELS ? [] : spreadLabels(labels);

  return (
    <>
      <svg viewBox="0 0 900 900" className="absolute inset-0 block size-full overflow-visible">
        {[r1, r2].map((r, i) => r && (
          <circle
            key={r}
            cx={CENTER.x}
            cy={CENTER.y}
            r={r}
            strokeWidth={1}
            strokeDasharray="2 6"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            style={{ fill: i === 0 ? tint("var(--foreground)", 1.5) : "none", stroke: "var(--border)" }}
          />
        ))}
        {drawn}
      </svg>

      <EdgeLabels labels={placedLabels} />

      {[...pos].map(([id, at]) => {
        const p = personaMap.get(id);
        if (!p) return null;
        const g = ix.groupColorOf(id);
        const c = g ?? NO_GROUP_RING;
        const size = sizes.get(id)!;
        const isCenter = id === focusId;
        const second = size === FOCUS_SIZES.second;
        let opacity = 1;
        if (hf && id !== hf && !linked(hf, id)) opacity = 0.3;
        else if (!hf && second) opacity = 0.7;
        if (ix.query && !ix.matches(p)) opacity = Math.min(opacity, 0.2);
        const ring = isCenter
          ? `0 0 0 3px var(--background), 0 0 0 5px ${c}, 0 0 48px ${tint(c, 25)}`
          : id === hf
            ? `inset 0 0 0 2px ${c}, 0 0 0 4px ${tint(c, 15)}`
            : `inset 0 0 0 1.5px ${c}`;
        const xy = toPercent(at);
        const meta = isCenter ? `${ix.handleOf(p.user_id)} · ${statusOf(p)}` : second ? "" : ix.handleOf(p.user_id);
        return (
          <PersonaNode
            key={id}
            persona={p}
            groupColor={g}
            left={xy.left}
            top={xy.top}
            size={size}
            fontSize={size * 0.34}
            ring={ring}
            opacity={opacity}
            selected={isCenter}
            onActivate={() => { if (!ix.wasDragged() && !isCenter) onRecenter(id); }}
            onHover={(h) => ix.onHoverPersona(h ? id : null)}
          >
            {/* Le nom, sous l'avatar, par-dessus les étiquettes de type. */}
            <span className="pointer-events-none absolute left-1/2 top-[calc(100%+0.6cqw)] z-10 flex -translate-x-1/2 flex-col items-center gap-[0.2cqw]">
              <span
                className={cn(
                  "whitespace-nowrap rounded-sm bg-background/80 px-[5px] py-px leading-[1.2]",
                  isCenter ? "font-semibold" : "font-medium",
                  second && id !== hf ? "text-muted-foreground" : "text-foreground",
                )}
                style={{ fontSize: `clamp(9px, ${isCenter ? 1.9 : second ? 1.05 : 1.3}cqw, 15px)` }}
              >
                {p.name}
              </span>
              {meta && (
                <span
                  className="whitespace-nowrap rounded-sm bg-background/80 px-[5px] leading-[1.2] text-muted-foreground"
                  style={{ fontSize: `clamp(8px, ${isCenter ? 1.25 : 1}cqw, 12px)` }}
                >
                  {meta}
                </span>
              )}
            </span>
          </PersonaNode>
        );
      })}

      {layout.neighbors.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-[62%] text-center text-sm text-muted-foreground">
          {t("noOrbitRelations")}
        </p>
      )}
    </>
  );
}
