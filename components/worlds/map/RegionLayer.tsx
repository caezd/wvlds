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
  clickThrough = false,
  onSelect,
  onPointsChanged,
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
  /**
   * Un outil est en main : les régions laissent passer le clic.
   *
   * Un polygone prend le pointeur et arrête la propagation. La règle en main,
   * le clic était donc mangé par la région et le point d'échelle ne se posait
   * pas — impossible de mesurer quoi que ce soit à l'intérieur d'un royaume.
   * Le tracé, lui, s'en sortait par sa vitre ; c'était la même faille, réparée
   * d'un seul côté.
   */
  clickThrough?: boolean;
  onSelect: (region: MapRegion) => void;
  /**
   * Les sommets de la région choisie ont changé.
   *
   * Un seul rappel pour les trois gestes — tirer un sommet, promener la
   * région entière, en ajouter un sur un côté : tous disent la même chose au
   * serveur, et n'ont pas à le dire de trois façons.
   */
  onPointsChanged: (region: MapRegion, points: Point[]) => void;
  /** Le tracé se referme sur son premier sommet. */
  onCloseDraft: () => void;
}) {
  const t = useTranslations("map");
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  // Le sommet qu'on tire, et où il en est : le polygone le suit sans
  // attendre le serveur.
  const [dragging, setDragging] = React.useState<{ index: number; point: Point } | null>(null);
  const dragStart = React.useRef<{ clientX: number; clientY: number; start: Point } | null>(null);
  // Le déplacement de la région ENTIÈRE : l'écart en pourcentages, et le
  // point de départ du geste. Les sommets se déplaçaient un par un ; rien ne
  // bougeait la forme d'un bloc, alors qu'un lieu, lui, se déplace.
  const [shift, setShift] = React.useState<Point | null>(null);
  const shiftStart = React.useRef<{ clientX: number; clientY: number; points: Point[] } | null>(null);
  /** Un déplacement se termine par un `click` : il ne doit pas désélectionner. */
  const shifted = React.useRef(false);
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
    if (region.id !== selectedId) return region.points;
    if (shift) return region.points.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y }));
    if (dragging) return region.points.map((p, i) => (i === dragging.index ? dragging.point : p));
    return region.points;
  }

  /**
   * Prend la région entière et la promène.
   *
   * L'écart est BORNÉ par la boîte du polygone : la forme reste entière dans
   * la carte, là où un simple bornage point par point l'aurait déformée en
   * écrasant contre le bord les seuls sommets qui débordent.
   */
  function startShift(e: React.PointerEvent<SVGPolygonElement>, region: MapRegion) {
    e.stopPropagation(); // ne pas déplacer la carte sous la région
    shiftStart.current = { clientX: e.clientX, clientY: e.clientY, points: region.points };
    shifted.current = false;
  }

  function moveShift(e: React.PointerEvent<SVGPolygonElement>) {
    const depart = shiftStart.current;
    const img = imgRef.current;
    if (!depart || !img) return;
    const r = img.getBoundingClientRect();
    const dx = ((e.clientX - depart.clientX) / r.width) * 100;
    const dy = ((e.clientY - depart.clientY) / r.height) * 100;
    // Quelques pixels de jeu avant de saisir : un clic qui tremble ne doit
    // pas déplacer une région.
    if (!shifted.current && Math.abs(e.clientX - depart.clientX) < 4 && Math.abs(e.clientY - depart.clientY) < 4) return;
    if (!shifted.current) {
      shifted.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const xs = depart.points.map((q) => q.x);
    const ys = depart.points.map((q) => q.y);
    setShift({
      x: Math.max(-Math.min(...xs), Math.min(dx, 100 - Math.max(...xs))),
      y: Math.max(-Math.min(...ys), Math.min(dy, 100 - Math.max(...ys))),
    });
  }

  function endShift(region: MapRegion) {
    const bougee = shifted.current && shift;
    shiftStart.current = null;
    if (bougee) onPointsChanged(region, region.points.map((q) => ({ x: q.x + shift.x, y: q.y + shift.y })));
    setShift(null);
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
    if (dragging && dragging.index === index) {
      onPointsChanged(region, region.points.map((q, i) => (i === index ? dragging.point : q)));
    }
    setDragging(null);
  }

  /**
   * Ajoute un sommet au milieu d'un côté.
   *
   * Une région se dessine d'un trait, et se corrige ensuite : sans cela, un
   * contour qu'on voulait affiner d'un cran obligeait à tout reprendre.
   */
  function addVertex(region: MapRegion, apres: number) {
    const a = region.points[apres];
    const b = region.points[(apres + 1) % region.points.length];
    const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    onPointsChanged(region, [
      ...region.points.slice(0, apres + 1),
      milieu,
      ...region.points.slice(apres + 1),
    ]);
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
          const deplacable = isEditMode && !clickThrough && region.id === selectedId;
          return (
            <polygon
              key={region.id}
              data-region-id={region.id}
              role="button"
              tabIndex={clickThrough ? -1 : 0}
              aria-label={region.label}
              points={toSvgPoints(pointsOf(region))}
              fill={region.color}
              fillOpacity={actif ? 0.4 : 0.2}
              stroke={region.color}
              strokeWidth={actif ? 3 : 2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{
                pointerEvents: clickThrough ? "none" : "auto",
                // La région choisie se prend et se promène ; les autres se
                // cliquent. Seule la choisie, pour que la carte reste
                // saisissable partout ailleurs — une région couvre parfois
                // la moitié de l'image.
                cursor: deplacable ? "move" : "pointer",
              }}
              onMouseEnter={() => setHoverId(region.id)}
              onMouseLeave={() => setHoverId((prev) => (prev === region.id ? null : prev))}
              onPointerDown={deplacable ? (e) => startShift(e, region) : undefined}
              onPointerMove={deplacable ? moveShift : undefined}
              onPointerUp={deplacable ? () => endShift(region) : undefined}
              onPointerCancel={deplacable ? () => endShift(region) : undefined}
              onClick={(e) => {
                e.stopPropagation();
                // Le `click` qui clôt un déplacement ne doit pas refermer le
                // panneau de la région qu'on vient de bouger.
                if (shifted.current) { shifted.current = false; return; }
                onSelect(region);
              }}
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

      {/* Les milieux de côté : un clic y ajoute un sommet. Plus discrets que
          les poignées de sommet — ils ne sont pas encore des sommets. */}
      {isEditMode && selected && !shift && pointsOf(selected).map((p, i, tous) => {
        const suivant = tous[(i + 1) % tous.length];
        const milieu = { x: (p.x + suivant.x) / 2, y: (p.y + suivant.y) / 2 };
        return (
          <button
            key={`m${i}`}
            type="button"
            data-region-midpoint={i}
            aria-label={t("addRegionVertex")}
            title={t("addRegionVertex")}
            className="absolute z-30 h-2.5 w-2.5 rounded-full border border-white/80 bg-foreground/40 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            style={{
              left: `${milieu.x}%`,
              top: `${milieu.y}%`,
              transform: "translate(-50%, -50%) scale(var(--pin-inv-scale, 1))",
              transformOrigin: "center center",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); addVertex(selected, i); }}
          />
        );
      })}

      {/* Les poignées de la région choisie, en édition */}
      {isEditMode && selected && pointsOf(selected).map((p, i) => (
        <button
          key={i}
          type="button"
          data-region-vertex={i}
          aria-label={t("regionVertex", { index: i + 1 })}
          title={t("removeRegionVertex")}
          className="absolute z-30 h-3 w-3 cursor-move rounded-full border-2 border-white bg-foreground shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            transform: "translate(-50%, -50%) scale(var(--pin-inv-scale, 1))",
            transformOrigin: "center center",
          }}
          onClick={(e) => e.stopPropagation()}
          // Le double-clic retire le sommet. C'est `WorldMap` qui refuse de
          // descendre sous trois — la règle vaut pour tous les gestes, pas
          // pour celui-ci seulement.
          onDoubleClick={(e) => {
            e.stopPropagation();
            onPointsChanged(selected, selected.points.filter((_, k) => k !== i));
          }}
          onPointerDown={(e) => startDrag(e, selected, i)}
          onPointerMove={(e) => moveDrag(e, i)}
          onPointerUp={() => endDrag(selected, i)}
          onPointerCancel={() => endDrag(selected, i)}
        />
      ))}
    </>
  );
}
