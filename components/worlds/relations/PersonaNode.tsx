"use client";

import type * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { isRetiredStatus } from "@/lib/personaStatus";
import { getInitials } from "@/lib/textFormatting";
import type { CPersona } from "./types";

/** Couleur de l'anneau d'un persona sans groupe. */
export const NO_GROUP_RING = "var(--muted-foreground)";

/** Une couleur des données (hex) adoucie, pour un fond ou un halo. */
export function tint(color: string, percent: number): string {
  return `color-mix(in oklab, ${color} ${percent}%, transparent)`;
}

/** Fond d'un avatar sans image : la couleur du groupe en lavis sur la carte. */
export function avatarFill(color: string | undefined, percent = 19): string {
  return color ? `linear-gradient(${tint(color, percent)}, ${tint(color, percent)}), var(--card)` : "var(--muted)";
}

/** Filtre d'un persona décédé ou retiré : grisé, un peu éteint. */
export function retiredFilter(persona: Pick<CPersona, "narrative_status">, dim = true): string | undefined {
  return isRetiredStatus(persona.narrative_status) ? (dim ? "grayscale(1) brightness(.75)" : "grayscale(1)") : undefined;
}

/**
 * L'avatar rond d'un persona : son image, ou ses initiales sur le lavis de
 * son groupe. `ring` est une liste d'ombres (anneau intérieur, liseré, halo),
 * posée par-dessus l'image — une ombre intérieure du conteneur passerait
 * dessous.
 */
export function PersonaAvatar({
  persona,
  groupColor,
  ring,
  imageSizes,
  dim = true,
  className,
  style,
}: {
  persona: CPersona;
  groupColor: string | undefined;
  ring?: string;
  /** Attribut `sizes` de l'image. */
  imageSizes: string;
  /** Le gris d'un retiré s'éteint aussi (plateau), ou non (panneau). */
  dim?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn("relative grid shrink-0 place-items-center rounded-full font-semibold leading-none text-foreground", className)}
      style={{ background: avatarFill(groupColor), filter: retiredFilter(persona, dim), ...style }}
    >
      {persona.avatar_url ? (
        <span className="absolute inset-0 overflow-hidden rounded-full">
          <Image src={persona.avatar_url} alt="" fill sizes={imageSizes} className="object-cover" />
        </span>
      ) : (
        getInitials(persona.name)
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full transition-shadow duration-200"
        style={{ boxShadow: ring ?? `inset 0 0 0 1.5px ${groupColor ?? NO_GROUP_RING}` }}
      />
    </span>
  );
}

/**
 * Un persona posé sur le plateau : centré sur (`left`, `top`) en pourcentage
 * du plateau, d'un diamètre en `cqw` — il suit la taille réelle du plateau
 * quand on zoome. `children` se pose sous l'avatar (le nom, en vue Centré).
 */
export function PersonaNode({
  persona,
  groupColor,
  left,
  top,
  size,
  fontSize,
  ring,
  opacity,
  selected,
  title,
  onActivate,
  onDoubleActivate,
  onHover,
  children,
}: {
  persona: CPersona;
  groupColor: string | undefined;
  left: number;
  top: number;
  /** Diamètre, en `cqw`. */
  size: number;
  /** Taille des initiales, en `cqw`. */
  fontSize: number;
  ring: string;
  opacity: number;
  selected: boolean;
  title?: string;
  onActivate: () => void;
  onDoubleActivate?: () => void;
  onHover: (hovered: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={persona.name}
      aria-pressed={selected}
      data-persona-node={persona.id}
      title={title}
      className="absolute cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${size}cqw`,
        height: `${size}cqw`,
        transform: "translate(-50%,-50%)",
        opacity,
        transition: "width .2s, height .2s, opacity .2s",
      }}
      onClick={(e) => { e.stopPropagation(); onActivate(); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleActivate?.(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(); }
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <PersonaAvatar
        persona={persona}
        groupColor={groupColor}
        ring={ring}
        imageSizes="96px"
        className="size-full"
        style={{ fontSize: `${fontSize}cqw` }}
      />
      {children}
    </div>
  );
}
