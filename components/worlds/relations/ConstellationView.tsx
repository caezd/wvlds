"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { isRetiredStatus } from "@/lib/personaStatus";
import { avatarRadius, focusCurve, labelWidth, pairOffsets, quadAt, spreadLabels, toPercent, type Edge } from "./geometry";
import { constellationLayout, type ConstellationInput, type ConstellationLayout } from "./constellationLayout";
import { EdgeLabels, PENDING_DASH, PlateEdge, edgeTypeLabel, type PlacedLabel, type PlateInteractions } from "./PlateParts";
import { NO_GROUP_RING, PersonaNode, tint } from "./PersonaNode";
import type { CPersona } from "./types";

/** Diamètre d'un avatar (en `cqw`) : un peu plus grand pour un persona très lié. */
function sizeOf(degree: number, big: boolean) {
  return big ? 3 : 2.1 + Math.min(degree, 7) * 0.1;
}
/** En deçà de ce nombre de personas, tous les noms restent affichés. */
const ALL_NAMES_UP_TO = 30;
/** Au-delà de ce nombre d'étiquettes de type, on n'en montre aucune. */
const MAX_LABELS = 14;

/**
 * La vue Constellations : chaque persona près de ceux qu'il connaît, les îlots
 * (joueurs ou groupes, selon « Regrouper ») teintés derrière eux, les personas
 * sans relation rangés à part. Survoler ou choisir un persona isole ses liens
 * et nomme leur type ; un double-clic ouvre la vue Centré sur lui.
 */
export function ConstellationView({
  input,
  personaMap,
  ix,
  clusterLabel,
  clusterColor,
  onActivatePersona,
  onOpenFocus,
  onBackgroundClick,
}: {
  input: ConstellationInput;
  personaMap: ReadonlyMap<string, CPersona>;
  ix: PlateInteractions;
  clusterLabel: (key: string) => string;
  /** Couleur d'un îlot (un groupe) ; absente : teinte neutre (un joueur, « sans groupe »). */
  clusterColor: (key: string) => string | undefined;
  onActivatePersona: (id: string) => void;
  onOpenFocus: (id: string) => void;
  onBackgroundClick: () => void;
}) {
  const t = useTranslations("relations");
  const [layout, setLayout] = React.useState<ConstellationLayout | null>(null);

  // Le placement ne dépend que des personas, des liens et des îlots : une clé
  // stable évite de le recalculer à chaque survol.
  const key = React.useMemo(
    () => JSON.stringify([
      input.personaIds.map((id) => `${id}:${input.clusterOf(id)}`),
      input.edges.map((e) => `${e.from}>${e.to}`),
      input.clusterOrder,
    ]),
    [input],
  );
  const inputRef = React.useRef(input);
  inputRef.current = input;
  React.useEffect(() => {
    let cancelled = false;
    void constellationLayout(inputRef.current).then((l) => { if (!cancelled) setLayout(l); });
    return () => { cancelled = true; };
  }, [key]);

  const degree = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const e of input.edges) {
      m.set(e.from, (m.get(e.from) ?? 0) + 1);
      m.set(e.to, (m.get(e.to) ?? 0) + 1);
    }
    return m;
  }, [input.edges]);

  if (!layout) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("constellationsLoading")}</div>;
  }

  const { pos } = layout;
  const fp = ix.hoverPersonaId && pos.has(ix.hoverPersonaId) ? ix.hoverPersonaId : ix.selectedPersonaId;
  const touches = (e: Edge) => !!fp && (e.from === fp || e.to === fp);
  const hoveredEdge = ix.hoverRelationId ? input.edges.find((e) => e.rels.some((r) => r.id === ix.hoverRelationId)) : undefined;
  const focusing = !!(fp || hoveredEdge);
  const adjacent = new Set<string>();
  for (const e of input.edges) if (touches(e)) { adjacent.add(e.from); adjacent.add(e.to); }
  if (hoveredEdge) { adjacent.add(hoveredEdge.from); adjacent.add(hoveredEdge.to); }

  const shown = input.edges.filter((e) => pos.has(e.from) && pos.has(e.to));
  const offsets = pairOffsets(shown);
  const size = (id: string) => sizeOf(degree.get(id) ?? 0, id === fp || id === ix.selectedPersonaId);

  const labels: Array<PlacedLabel & { w: number }> = [];
  const drawn = shown.map((e) => {
    const meta = ix.typeOf(e.type);
    const curve = focusCurve(pos.get(e.from)!, pos.get(e.to)!, avatarRadius(size(e.from)), avatarRadius(size(e.to)), offsets.get(e.id) ?? 0);
    const active = e === hoveredEdge || touches(e);
    let opacity = e.pending ? 0.45 : 0.7;
    if (focusing) opacity = active ? 1 : 0.06;
    const from = personaMap.get(e.from), to = personaMap.get(e.to);
    if (ix.query && !(from && ix.matches(from)) && !(to && ix.matches(to))) opacity = Math.min(opacity, 0.05);
    if (fp && touches(e) && !ix.query) {
      const at = quadAt(curve.a, curve.c, curve.b, 0.5);
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
        width={active ? 2.4 : 1.4}
        opacity={opacity}
        arrow={e.directed ? (active ? { length: 9, halfWidth: 4.2 } : { length: 7, halfWidth: 3.4 }) : null}
        zoom={ix.zoom}
        onHover={ix.onEdgeHover}
      />
    );
  });
  const placedLabels = labels.length > MAX_LABELS ? [] : spreadLabels(labels);
  const manyNames = pos.size > ALL_NAMES_UP_TO;

  return (
    <>
      <svg viewBox="0 0 900 900" className="absolute inset-0 block size-full overflow-visible">
        <rect x={0} y={0} width={900} height={900} fill="transparent" onClick={() => { if (!ix.wasDragged()) onBackgroundClick(); }} />
        {layout.clusters.map((c) => {
          const color = clusterColor(c.key);
          const on = !!fp && c.ids.includes(fp);
          return (
            <path
              key={c.key}
              d={c.outline}
              data-constellation-cluster={c.key}
              pointerEvents="none"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              style={{
                fill: color ? tint(color, on ? 14 : 8) : tint("var(--foreground)", on ? 5 : 3),
                stroke: color ? tint(color, 45) : "var(--border)",
                transition: "fill .2s",
              }}
            />
          );
        })}
        {drawn}
      </svg>

      {/* Le nom de chaque îlot, au-dessus de son contour. */}
      {layout.clusters.map((c) => {
        const at = toPercent(c.labelAt);
        const color = clusterColor(c.key);
        return (
          <span
            key={c.key}
            aria-hidden
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap font-semibold tracking-[.02em] text-muted-foreground"
            style={{
              left: `${at.left}%`,
              top: `${at.top}%`,
              fontSize: "clamp(9px, 1.25cqw, 13px)",
              textShadow: "0 0 3px var(--background), 0 0 6px var(--background)",
              ...(color ? { color } : null),
            }}
          >
            {clusterLabel(c.key)}
          </span>
        );
      })}

      {layout.isolatedTop !== null && (
        <span
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-muted-foreground"
          style={{ top: `${toPercent({ x: 0, y: layout.isolatedTop }).top}%`, fontSize: "clamp(9px, 1.2cqw, 12px)" }}
        >
          {t("isolatedCount", { count: layout.isolated.length })}
        </span>
      )}

      <EdgeLabels labels={placedLabels} />

      {[...pos].map(([id, at]) => {
        const p = personaMap.get(id);
        if (!p) return null;
        const g = ix.groupColorOf(id);
        const isF = id === fp, isSel = id === ix.selectedPersonaId, near = adjacent.has(id);
        let opacity = 1;
        if (focusing && !isF && !near) opacity = 0.3;
        if (ix.query && !ix.matches(p)) opacity = 0.2;
        const s = size(id);
        const ring = isSel
          ? "0 0 0 2px var(--background), 0 0 0 3.5px var(--foreground)"
          : `inset 0 0 0 1.5px ${g ?? NO_GROUP_RING}, 0 0 0 2px var(--background)`;
        const xy = toPercent(at);
        const isolated = layout.isolated.includes(id);
        const show = !manyNames || isolated || (degree.get(id) ?? 0) >= 3 || isF || isSel || near || ix.zoom >= 1.6 || (!!ix.query && ix.matches(p));
        return (
          <PersonaNode
            key={id}
            persona={p}
            groupColor={g}
            left={xy.left}
            top={xy.top}
            size={s}
            fontSize={s * 0.34}
            ring={ring}
            opacity={opacity}
            selected={isSel}
            title={t("dblClickHint")}
            onActivate={() => { if (!ix.wasDragged()) onActivatePersona(id); }}
            onDoubleActivate={() => onOpenFocus(id)}
            onHover={(h) => ix.onHoverPersona(h ? id : null)}
          >
            <span
              aria-hidden
              data-persona-label={id}
              className={cn(
                "pointer-events-none absolute left-1/2 top-[calc(100%+0.4cqw)] z-10 -translate-x-1/2 whitespace-nowrap rounded-sm bg-background/80 px-[4px] leading-[1.2] transition-opacity duration-200",
                isF || isSel ? "font-semibold text-foreground" : near ? "font-medium text-foreground" : "text-muted-foreground",
                isRetiredStatus(p.narrative_status) && "italic",
              )}
              style={{ fontSize: `clamp(8px, ${isF || isSel ? 1.25 : 1.05}cqw, 13px)`, opacity: show ? 1 : 0 }}
            >
              {p.name}
            </span>
          </PersonaNode>
        );
      })}
    </>
  );
}
