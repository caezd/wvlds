"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { MapRegion } from "@/app/actions/worldMap";
import type { Point } from "./zoom";
import { polygonCentroid, toSvgPoints } from "./geometry";

/**
 * Les régions d'une carte : des polygones dans l'enveloppe transformée.
 *
 * Un seul `<svg>` étiré sur toute l'enveloppe (`preserveAspectRatio="none"`)
 * pour que ses coordonnées soient les pourcentages des épingles ; il suit
 * donc le déplacement et l'agrandissement sans un calcul, et
 * `non-scaling-stroke` garde les contours à la même épaisseur. Le SVG
 * lui-même ne prend pas le pointeur — la carte se déplace en le saisissant
 * n'importe où —, seuls les polygones le prennent.
 *
 * Les noms et les poignées sont du HTML à contre-échelle, comme les
 * marqueurs : un texte SVG s'étirerait avec le cadre.
 */
export function RegionLayer({
  regions,
  selectedId,
  draft,
  isEditMode,
  imgRef,
  onSelect,
  onVertexMoved,
}: {
  regions: MapRegion[];
  selectedId: string | null;
  /** Le polygone en cours de tracé — `null` quand on ne dessine pas. */
  draft: Point[] | null;
  isEditMode: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
  onSelect: (region: MapRegion) => void;
  /** Un sommet de la région choisie vient d'être déplacé. */
  onVertexMoved: (region: MapRegion, index: number, point: Point) => void;
}) {
  const t = useTranslations("map");
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  // Le sommet qu'on tire, et où il en est : le polygone le suit sans
  // attendre le serveur.
  const [dragging, setDragging] = React.useState<{ index: number; point: Point } | null>(null);
  const dragStart = React.useRef<{ clientX: number; clientY: number; start: Point } | null>(null);

  function pointsOf(region: MapRegion): Point[] {
    if (!dragging || region.id !== selectedId) return region.points;
    return region.points.map((p, i) => (i === dragging.index ? dragging.point : p));
  }

  function startDrag(e: React.PointerEvent<HTMLButtonElement>, region: MapRegion, index: number) {
    e.stopPropagation(); // ne pas déplacer la carte
    dragStart.current = { clientX: e.clientX, clientY: e.clientY, start: region.points[index] };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    const depart = dragStart.current;
    const img = imgRef.current;
    if (!depart || !img) return;
    // Le rectangle mesuré tient compte de la transformation : le pourcentage
    // se lit directement.
    const r = img.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, depart.start.x + ((e.clientX - depart.clientX) / r.width) * 100));
    const y = Math.max(0, Math.min(100, depart.start.y + ((e.clientY - depart.clientY) / r.height) * 100));
    setDragging({ index, point: { x, y } });
  }

  function endDrag(region: MapRegion, index: number) {
    dragStart.current = null;
    if (dragging && dragging.index === index) onVertexMoved(region, index, dragging.point);
    setDragging(null);
  }

  const selected = regions.find((r) => r.id === selectedId) ?? null;

  return (
    <>
      {/* Pas d'`aria-hidden` sur le SVG : les polygones sont des boutons, et
          un lecteur d'écran doit pouvoir les atteindre. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {regions.map((region) => {
          const actif = region.id === selectedId || region.id === hoverId;
          return (
            <polygon
              key={region.id}
              data-region-id={region.id}
              role="button"
              tabIndex={0}
              aria-label={region.label}
              points={toSvgPoints(pointsOf(region))}
              fill={region.color}
              fillOpacity={actif ? 0.4 : 0.2}
              stroke={region.color}
              strokeWidth={actif ? 3 : 2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: "auto", cursor: "pointer" }}
              onMouseEnter={() => setHoverId(region.id)}
              onMouseLeave={() => setHoverId((prev) => (prev === region.id ? null : prev))}
              onClick={(e) => { e.stopPropagation(); onSelect(region); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(region); }
              }}
            />
          );
        })}
        {draft && draft.length > 1 && (
          <polygon
            data-region-draft
            points={toSvgPoints(draft)}
            className="fill-primary/15 stroke-primary"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Les sommets du tracé en cours */}
      {draft?.map((p, i) => (
        <div
          key={i}
          data-draft-vertex
          className="pointer-events-none absolute z-20 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary shadow"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            transform: "translate(-50%, -50%) scale(var(--pin-inv-scale, 1))",
            transformOrigin: "center center",
          }}
        />
      ))}

      {/* Les noms, au centre de chaque région */}
      {regions.map((region) => {
        if (!region.label.trim()) return null;
        const c = polygonCentroid(pointsOf(region));
        return (
          <div
            key={region.id}
            data-region-label
            className={cn(
              "pointer-events-none absolute z-10 whitespace-nowrap text-xs font-semibold text-white",
              "[text-shadow:0_0_3px_rgba(0,0,0,0.9),0_0_8px_rgba(0,0,0,0.6)]",
            )}
            style={{
              left: `${c.x}%`,
              top: `${c.y}%`,
              transform: "translate(-50%, -50%) scale(var(--pin-inv-scale, 1))",
              transformOrigin: "center center",
            }}
          >
            {region.label}
          </div>
        );
      })}

      {/* Les poignées de la région choisie, en édition */}
      {isEditMode && selected && pointsOf(selected).map((p, i) => (
        <button
          key={i}
          type="button"
          data-region-vertex={i}
          aria-label={t("regionVertex", { index: i + 1 })}
          className="absolute z-30 h-3 w-3 cursor-move rounded-full border-2 border-white bg-foreground shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            transform: "translate(-50%, -50%) scale(var(--pin-inv-scale, 1))",
            transformOrigin: "center center",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => startDrag(e, selected, i)}
          onPointerMove={(e) => moveDrag(e, i)}
          onPointerUp={() => endDrag(selected, i)}
          onPointerCancel={() => endDrag(selected, i)}
        />
      ))}
    </>
  );
}
