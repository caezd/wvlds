"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { MapPin, MapPinLink } from "@/app/actions/worldMap";
import { distanceBetween, formatDistance, type MapScale } from "./scale";
import { LARGEUR_CENTRE, largeurEtiquette, layoutLinkGraph, otherEnd } from "./linkGraph";

/**
 * Ce que ce lieu touche, en petit.
 *
 * La fiche disait ce qu'un lieu est ; elle ne disait pas ce qui y mène. Le
 * lieu ouvert tient le centre, ceux qui le rejoignent se répartissent de part
 * et d'autre, et un trait pointillé va de l'un à l'autre — la même écriture
 * que sur la carte, en réduction.
 *
 * Chaque voisin est posé DANS SA DIRECTION : un lieu à l'ouest se montre à
 * gauche. Le placement vit dans `linkGraph.ts`, avec les largeurs — c'est
 * ensemble qu'elles décident si le trait se voit.
 *
 * Les traits sont en SVG étiré (`preserveAspectRatio="none"`), donc en
 * pourcentages du cadre ; les boîtes sont du HTML, qui seul sait tronquer un
 * nom trop long.
 */

export function PinLinkGraph({
  pin,
  links,
  pins,
  aspect,
  scale,
  onOpenPin,
}: {
  pin: MapPin;
  /** Les liens qui touchent ce lieu — le filtrage est fait par `WorldMap`. */
  links: MapPinLink[];
  /** Les épingles de la carte, par identifiant : de quoi nommer les voisins. */
  pins: Map<string, MapPin>;
  /** Hauteur / largeur de la carte, pour que les distances soient justes. */
  aspect: number;
  scale: MapScale | null;
  onOpenPin: (pin: MapPin) => void;
}) {
  // Le trait survolé s'allume : c'est ce qui dit lequel des voisins on vise
  // quand ils sont plusieurs. Les traits vivent dans un autre élément que les
  // boîtes — aucun sélecteur CSS ne les relie, d'où cet état.
  const [survole, setSurvole] = React.useState<string | null>(null);

  const voisins = React.useMemo(() => {
    const vus = new Set<string>();
    return links
      .map((lien) => {
        const autre = otherEnd(lien, pin.id);
        const cible = autre ? pins.get(autre) : undefined;
        if (!cible || vus.has(cible.id)) return null;
        vus.add(cible.id);
        return { id: cible.id, title: cible.title, pin: cible, label: lien.label.trim() };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [links, pins, pin.id]);

  const { center, nodes, hidden } = React.useMemo(
    () => layoutLinkGraph(
      pin,
      voisins.map((v) => ({ id: v.id, title: v.title, x: v.pin.x, y: v.pin.y })),
      aspect,
    ),
    [pin, voisins, aspect],
  );

  if (voisins.length === 0) return null;

  const parId = new Map(voisins.map((v) => [v.id, v]));

  return (
    <div
      data-link-graph
      className="relative h-40 w-full overflow-hidden rounded-md border border-border-soft bg-background/50"
    >
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {nodes.map((n) => (
          <line
            key={n.id}
            x1={center.x}
            y1={center.y}
            x2={n.x}
            y2={n.y}
            vectorEffect="non-scaling-stroke"
            className={cn(
              "transition-colors",
              survole === n.id ? "stroke-foreground" : "stroke-muted-foreground/50",
            )}
            strokeWidth={survole === n.id ? 1.5 : 1}
            strokeDasharray="2 3"
          />
        ))}
      </svg>

      {/* Les bouts de chaque trait : un carré au départ, un à l'arrivée. Sans
          eux, le pointillé s'arrêtait dans le vide sous les boîtes. */}
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {nodes.map((n) => (
          <rect
            key={n.id}
            x={n.x - 0.8}
            y={n.y - 1.6}
            width={1.6}
            height={3.2}
            className={cn(
              "transition-colors",
              survole === n.id ? "fill-foreground" : "fill-muted-foreground/60",
            )}
          />
        ))}
      </svg>

      {/* Le lieu ouvert, au centre. Il ne mène nulle part : on y est déjà. */}
      <span
        data-link-graph-center
        className="absolute z-10 truncate rounded-sm bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background"
        style={{
          left: `${center.x}%`,
          top: `${center.y}%`,
          maxWidth: `${LARGEUR_CENTRE}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        {pin.title}
      </span>

      {nodes.map((n) => {
        const voisin = parId.get(n.id)!;
        const distance = scale
          ? formatDistance(distanceBetween(pin, voisin.pin, aspect, scale), scale.unit)
          : null;
        const detail = [voisin.label, distance].filter(Boolean).join(" · ");
        return (
          <button
            key={n.id}
            type="button"
            aria-label={voisin.title}
            onClick={() => onOpenPin(voisin.pin)}
            onPointerEnter={() => setSurvole(n.id)}
            onPointerLeave={() => setSurvole((prev) => (prev === n.id ? null : prev))}
            onFocus={() => setSurvole(n.id)}
            onBlur={() => setSurvole((prev) => (prev === n.id ? null : prev))}
            className={cn(
              "absolute z-10 flex flex-col rounded-sm border bg-background px-1.5 py-0.5 text-left",
              "text-[10px] leading-tight transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              survole === n.id ? "border-foreground bg-secondary" : "border-border-soft",
            )}
            style={{
              left: `${n.x}%`,
              top: `${n.y}%`,
              maxWidth: `${largeurEtiquette(n)}%`,
              // La boîte pousse VERS LE BORD depuis son point d'accroche, qui
              // reste ainsi du côté du centre — là d'où arrive le trait, et
              // où se trouve son repère. Poussée vers l'intérieur, elle
              // mettait son repère sur le bord opposé au trait, et venait
              // mordre le couloir réservé au centre.
              transform: n.side === "left" ? "translate(-100%, -50%)" : "translate(0, -50%)",
            }}
          >
            <span className="truncate font-medium">{voisin.title}</span>
            {detail && <span className="truncate text-muted-foreground">{detail}</span>}
          </button>
        );
      })}

      {hidden > 0 && (
        <span className="absolute bottom-1 right-1 rounded bg-secondary px-1 text-[9px] text-muted-foreground">
          +{hidden}
        </span>
      )}
    </div>
  );
}
