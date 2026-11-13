"use client";

import type * as React from "react";

import { arrowPath, arrowScale, toPercent, type Curve, type Edge } from "./geometry";
import type { CPersona, CRelType } from "./types";

// Ce que les deux vues du plateau (Cercle, Centré) partagent : l'état de
// mise en avant qu'elles lisent, les gestes qu'elles remontent, le tracé
// d'un lien et les étiquettes de type.

/** Une relation en attente se dessine en pointillé serré : elle n'existe pas encore vraiment. */
export const PENDING_DASH = "2 5";

/** État de mise en avant et gestes, fournis par le canevas aux deux vues. */
export type PlateInteractions = {
  zoom: number;
  /** Recherche en cours (en minuscules), vide sinon. */
  query: string;
  matches: (persona: CPersona) => boolean;
  hoverPersonaId: string | null;
  hoverUserId: string | null;
  hoverRelationId: string | null;
  selectedPersonaId: string | null;
  selectedUserId: string | null;
  groupColorOf: (personaId: string) => string | undefined;
  typeOf: (typeId: string) => CRelType;
  handleOf: (userId: string) => string;
  onHoverPersona: (id: string | null) => void;
  onHoverUser: (id: string | null) => void;
  /** Survol d'un lien : la bulle suit la souris ; `null` à la sortie. */
  onEdgeHover: (edge: Edge, e: React.MouseEvent | null) => void;
  /** Vrai si l'appui qui s'achève a déplacé le plateau. */
  wasDragged: () => boolean;
};

/** Le nom d'un type sur une étiquette, avec « en attente » s'il y a lieu. */
export function edgeTypeLabel(meta: CRelType, pending: boolean, pendingWord: string): string {
  return pending ? `${meta.name} · ${pendingWord}` : meta.name;
}

/**
 * Un lien tracé : le trait (épaisseur fixe à l'écran, quel que soit le
 * zoom), la pointe s'il n'a qu'un sens, et une bande invisible plus large
 * pour le survol.
 */
export function PlateEdge({
  edge,
  curve,
  color,
  dash,
  width,
  opacity,
  arrow,
  zoom,
  onHover,
}: {
  edge: Edge;
  curve: Curve;
  color: string;
  dash: string | undefined;
  width: number;
  opacity: number;
  /** Longueur et demi-largeur de la pointe, avant division par le zoom ; absente sans sens. */
  arrow: { length: number; halfWidth: number } | null;
  zoom: number;
  onHover: (edge: Edge, e: React.MouseEvent | null) => void;
}) {
  const s = arrowScale(zoom);
  return (
    <g data-relation-edge={edge.id}>
      <path
        d={curve.d}
        fill="none"
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
        style={{ stroke: color, opacity, transition: "opacity .2s, stroke-width .2s" }}
      />
      {arrow && (
        <path
          data-relation-arrow
          d={arrowPath(curve.b, curve.c, arrow.length / s, arrow.halfWidth / s)}
          strokeLinejoin="round"
          pointerEvents="none"
          style={{ fill: color, opacity, transition: "opacity .2s" }}
        />
      )}
      <path
        d={curve.d}
        fill="none"
        stroke="transparent"
        strokeWidth={9}
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "stroke" }}
        onMouseEnter={(e) => onHover(edge, e)}
        onMouseMove={(e) => onHover(edge, e)}
        onMouseLeave={() => onHover(edge, null)}
      />
    </g>
  );
}

export type PlacedLabel = { key: string; x: number; y: number; text: string; color: string };

/** Les étiquettes de type, posées en repère du plateau (déjà écartées). */
export function EdgeLabels({ labels }: { labels: PlacedLabel[] }) {
  return (
    <>
      {labels.map((l) => {
        const at = toPercent(l);
        return (
          <span
            key={l.key}
            data-edge-label
            className="pointer-events-none absolute whitespace-nowrap rounded-md bg-background px-[7px] py-0.5 font-medium leading-[1.3]"
            style={{
              left: `${at.left}%`,
              top: `${at.top}%`,
              transform: "translate(-50%,-50%)",
              color: l.color,
              boxShadow: `0 0 0 1px color-mix(in oklab, ${l.color} 33%, transparent), 0 4px 10px rgb(0 0 0 / .4)`,
              fontSize: "clamp(9px, 1.05cqw, 12px)",
            }}
          >
            {l.text}
          </span>
        );
      })}
    </>
  );
}
