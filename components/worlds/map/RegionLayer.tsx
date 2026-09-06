"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { MapRegion } from "@/app/actions/worldMap";
import type { Point } from "./zoom";
import { MIN_REGION_POINTS, polygonCentroid, toSvgPoints } from "./geometry";

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
  labelled,
  onSelect,
  onVertexMoved,
  onCloseDraft,
}: {
  regions: MapRegion[];
  selectedId: string | null;
  /** Le polygone en cours de tracé — `null` quand on ne dessine pas. */
  draft: Point[] | null;
  isEditMode: boolean;
  imgRef: React.RefObject<HTMLImageElement | null>;
  /** Les régions dont le nom tient sans en recouvrir un autre — `labels.ts`. */
  labelled?: Set<string>;
  onSelect: (region: MapRegion) => void;
  /** Un sommet de la région choisie vient d'être déplacé. */
  onVertexMoved: (region: MapRegion, index: number, point: Point) => void;
  /** Le tracé se referme sur son premier sommet. */
  onCloseDraft: () => void;
}) {
  const t = useTranslations("map");
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  // Le sommet qu'on tire, et où il en est : le polygone le suit sans
  // attendre le serveur.
  const [dragging, setDragging] = React.useState<{ index: number; point: Point } | null>(null);
  const dragStart = React.useRef<{ clientX: number; clientY: number; start: Point } | null>(null);
  // Où le curseur se trouve pendant un tracé : c'est lui qui donne au
  // polygone son dernier sommet, provisoire, et montre la forme qu'aurait la
  // région si l'on cliquait là.
  const [cursor, setCursor] = React.useState<Point | null>(null);

  /** Le point survolé, en pourcentages de la carte. */
  function pointFromEvent(e: React.MouseEvent): Point | null {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }

  // Le tracé tel qu'on le voit : les sommets posés, plus celui que la souris
  // promène. Un `<polygon>` et non une ligne ouverte — la région se ferme de
  // toute façon, autant la montrer fermée.
  const apercu = draft ? (cursor ? [...draft, cursor] : draft) : null;
  const peutFermer = (draft?.length ?? 0) >= MIN_REGION_POINTS;

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
        {apercu && apercu.length > 1 && (
          <polygon
            data-region-draft
            points={toSvgPoints(apercu)}
            className="fill-primary/15 stroke-primary"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Pendant le tracé, une vitre au-dessus de tout suit la souris. Elle
            ne retient pas les clics : ils vont au cadre, qui pose le sommet.
            Au-dessus des régions existantes, sans quoi la ligne se figerait
            dès que le curseur en survole une. */}
        {draft && (
          <rect
            data-draft-surface
            x="0"
            y="0"
            width="100"
            height="100"
            fill="transparent"
            style={{ pointerEvents: "auto" }}
            onMouseMove={(e) => setCursor(pointFromEvent(e))}
            onMouseLeave={() => setCursor(null)}
          />
        )}
      </svg>

      {/* Les sommets du tracé en cours. Le premier devient la poignée de
          fermeture dès qu'il y a de quoi faire une région : revenir à son
          point de départ est le geste qu'on essaie d'abord. */}
      {draft?.map((p, i) => {
        const estLaFermeture = i === 0 && peutFermer;
        const style = {
          left: `${p.x}%`,
          top: `${p.y}%`,
          transform: "translate(-50%, -50%) scale(var(--pin-inv-scale, 1))",
          transformOrigin: "center center",
        } as const;

        if (!estLaFermeture) {
          return (
            <div
              key={i}
              data-draft-vertex
              className="pointer-events-none absolute z-20 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary shadow"
              style={style}
            />
          );
        }
        return (
          <button
            key={i}
            type="button"
            data-draft-vertex
            data-draft-close
            aria-label={t("closeRegion")}
            title={t("closeRegion")}
            // Le clic ne doit pas poser un sommet de plus, ni le geste
            // entamer un déplacement de la carte.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onCloseDraft(); }}
            className="absolute z-30 h-4 w-4 rounded-full border-2 border-white bg-primary shadow ring-2 ring-primary/40 transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-4"
            style={style}
          />
        );
      })}

      {/* Les noms, au centre de chaque région. Ils passent par le même tri
          que ceux des lieux : sans quoi le nom d'une région et celui d'un lieu
          proche de son centre se recouvraient, chacun ignorant l'autre. */}
      {regions.map((region) => {
        if (!region.label.trim()) return null;
        if (labelled && !labelled.has(region.id)) return null;
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
