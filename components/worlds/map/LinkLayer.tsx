"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { MapPin, MapPinLink } from "@/app/actions/worldMap";
import { distanceBetween, formatDistance, type MapScale } from "./scale";

/**
 * Les traits entre les lieux d'une carte : routes, passes, fleuves.
 *
 * Même dessin que les régions — un seul `<svg>` étiré sur toute l'enveloppe
 * (`preserveAspectRatio="none"`), dont les coordonnées sont donc les
 * pourcentages des épingles. Le tracé suit le déplacement et
 * l'agrandissement sans un calcul, et `non-scaling-stroke` garde les traits à
 * la même épaisseur quel que soit l'étirement.
 *
 * Ce que porte un lien se lit en HTML à contre-échelle, comme les noms de
 * lieux : un texte SVG s'étirerait avec le cadre.
 *
 * La distance ne se stocke pas : elle se déduit des positions et de
 * l'échelle, et suit donc les épingles quand on les déplace — un chemin qu'on
 * rallonge se rallonge tout seul.
 *
 * Elle ne s'affiche qu'à la demande. Portée en permanence par chaque trait,
 * elle chiffrait la carte de part en part : dix routes faisaient dix nombres
 * posés dessus, et le nom des chemins se perdait au milieu.
 *
 * Au survol, donc — et au clic, qui l'épingle jusqu'au suivant : un doigt ne
 * survole rien, et la moitié des cartes se lisent au doigt.
 */
export function LinkLayer({
  links,
  pins,
  selectedPinId,
  aspect,
  scale,
  isEditMode,
  onSelect,
}: {
  links: MapPinLink[];
  /** Les épingles de la carte affichée, par identifiant. */
  pins: Map<string, MapPin>;
  /** Le lieu ouvert : les traits qui le touchent ressortent. */
  selectedPinId: string | null;
  /** Hauteur / largeur de la carte, pour que les distances soient justes. */
  aspect: number;
  scale: MapScale | null;
  isEditMode: boolean;
  onSelect?: (link: MapPinLink) => void;
}) {
  // Le trait qui dit sa longueur : celui qu'on survole, ou celui qu'on a
  // touché. Deux états et non un seul — une souris qui quitte un trait
  // épinglé ne doit pas le désépingler.
  const [survole, setSurvole] = React.useState<string | null>(null);
  const [epingle, setEpingle] = React.useState<string | null>(null);
  const montre = (id: string) => survole === id || epingle === id;
  /** Le formulaire d'un lien ne s'ouvre qu'en écriture. */
  const modifiable = isEditMode && !!onSelect;

  // Un trait épinglé se relâche au geste suivant, où qu'il tombe : sinon la
  // longueur resterait posée sur la carte sans qu'on sache comment l'ôter.
  React.useEffect(() => {
    if (!epingle) return;
    function relacher(e: PointerEvent) {
      const cible = e.target as Element | null;
      if (cible?.closest?.("[data-link-hit]")) return;
      setEpingle(null);
    }
    document.addEventListener("pointerdown", relacher);
    return () => document.removeEventListener("pointerdown", relacher);
  }, [epingle]);

  const traces = links
    .map((link) => {
      const a = pins.get(link.from_pin_id);
      const b = pins.get(link.to_pin_id);
      return a && b ? { link, a, b } : null;
    })
    .filter((t): t is { link: MapPinLink; a: MapPin; b: MapPin } => t !== null);

  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {traces.map(({ link, a, b }) => {
          const touche =
            montre(link.id) ||
            selectedPinId === link.from_pin_id ||
            selectedPinId === link.to_pin_id;
          return (
            <g key={link.id}>
              {/* Un trait clair dessous : sur une carte sombre, un trait seul
                  se perd dans le décor. */}
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                vectorEffect="non-scaling-stroke"
                className="stroke-white/70"
                strokeWidth={3.5}
                strokeLinecap="round"
              />
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                vectorEffect="non-scaling-stroke"
                className={cn("transition-colors", touche ? "stroke-primary" : "stroke-black/70")}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeDasharray="5 3"
              />
              {/* La prise, invisible et large : un trait de 1,5 px ne se vise
                  ni à la souris ni au doigt. Elle existe pour tout le monde —
                  c'est elle qui fait paraître la distance au survol — mais
                  n'ouvre le formulaire qu'en écriture. */}
              <line
                data-link-hit={link.id}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                vectorEffect="non-scaling-stroke"
                stroke="transparent"
                strokeWidth={14}
                className={cn("pointer-events-auto", modifiable && "cursor-pointer")}
                onPointerEnter={() => setSurvole(link.id)}
                onPointerLeave={() => setSurvole((prev) => (prev === link.id ? null : prev))}
                onClick={(e) => {
                  e.stopPropagation();
                  setEpingle((prev) => (prev === link.id ? null : link.id));
                  if (modifiable) onSelect(link);
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </g>
          );
        })}
      </svg>

      {traces.map(({ link, a, b }) => {
        // La longueur ne paraît qu'au survol ; le nom, lui, reste.
        const distance =
          montre(link.id) && scale
            ? formatDistance(distanceBetween(a, b, aspect, scale), scale.unit)
            : null;
        const texte = [link.label.trim(), distance].filter(Boolean).join(" · ");
        if (!texte) return null;
        return (
          <div
            key={link.id}
            aria-hidden
            data-link-label={link.id}
            className="pointer-events-none absolute z-[5] whitespace-nowrap rounded bg-black/70 px-1 py-px text-[10px] font-medium text-white shadow-sm"
            style={{
              left: `${(a.x + b.x) / 2}%`,
              top: `${(a.y + b.y) / 2}%`,
              transform: "translate(-50%, -50%) scale(var(--pin-inv-scale, 1))",
              transformOrigin: "center center",
            }}
          >
            {texte}
          </div>
        );
      })}
    </>
  );
}
