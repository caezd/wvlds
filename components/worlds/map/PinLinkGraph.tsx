"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { MapPin, MapPinLink } from "@/app/actions/worldMap";
import { distanceBetween, formatDistance, type MapScale } from "./scale";
import { layoutLinkGraph, otherEnd } from "./linkGraph";

/**
 * Ce que ce lieu touche, en petit.
 *
 * La fiche disait ce qu'un lieu est ; elle ne disait pas ce qui y mène. Le
 * lieu ouvert tient le centre, ceux qui le rejoignent se répartissent de part
 * et d'autre, et un trait pointillé va de l'un à l'autre — la même écriture
 * que sur la carte, en réduction.
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
    () => layoutLinkGraph(voisins.map((v) => ({ id: v.id, title: v.title }))),
    [voisins],
  );

  if (voisins.length === 0) return null;

  const parId = new Map(voisins.map((v) => [v.id, v]));

  return (
    <div data-link-graph className="relative h-36 w-full overflow-hidden rounded-md bg-background/60">
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
            className="stroke-muted-foreground/50"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        ))}
      </svg>

      {/* Le lieu ouvert, au centre. Il ne mène nulle part : on y est déjà. */}
      <span
        data-link-graph-center
        className="absolute z-10 max-w-[36%] truncate rounded border border-foreground bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background"
        style={{ left: `${center.x}%`, top: `${center.y}%`, transform: "translate(-50%, -50%)" }}
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
            onClick={() => onOpenPin(voisin.pin)}
            className={cn(
              "absolute z-10 flex max-w-[42%] flex-col rounded border border-border-soft bg-background px-1.5 py-0.5 text-left",
              "text-[10px] leading-tight transition-colors hover:border-foreground hover:bg-secondary",
            )}
            style={{
              left: `${n.x}%`,
              top: `${n.y}%`,
              transform: n.side === "left" ? "translate(0, -50%)" : "translate(-100%, -50%)",
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
