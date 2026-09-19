"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { isRetiredStatus } from "@/lib/personaStatus";
import { PersonaStatusBadge } from "@/components/personas/PersonaStatusBadge";
import { getInitials } from "@/lib/textFormatting";
import { CW, CH } from "./geometry";
import type { CPersona } from "./types";

/**
 * La carte d'un persona — la même sur le canevas et dans la rangée mobile.
 *
 * L'avatar remplit la carte, le nom se lit sur un voile en bas, la bordure
 * porte la couleur du groupe. Une pastille compte les demandes qui attendent
 * ce persona (pour son joueur seulement), un chiffre discret ses relations.
 */
export function PersonaCard({
  persona,
  groupColor,
  selected = false,
  dimmed = false,
  pendingCount = 0,
  relationCount = 0,
  onSelect,
  corner,
  className,
}: {
  persona: CPersona;
  groupColor?: string;
  selected?: boolean;
  dimmed?: boolean;
  pendingCount?: number;
  relationCount?: number;
  onSelect: () => void;
  /** Un élément posé dans le coin haut droit (la pastille de groupe du canevas). */
  corner?: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("relations");
  const gc = groupColor;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={persona.name}
      aria-pressed={selected}
      style={{ width: CW, height: CH, borderColor: selected ? "hsl(var(--primary))" : (gc ?? "transparent") }}
      className={cn(
        "relative cursor-pointer rounded-lg border-2 transition-all",
        selected ? "ring-1 ring-primary/30" : "hover:opacity-90",
        dimmed && "opacity-20 grayscale",
        // Décédé ou retiré : présent, mais en retrait.
        !dimmed && isRetiredStatus(persona.narrative_status) && "opacity-60 grayscale",
        className,
      )}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[6px]">
        {persona.avatar_url ? (
          <Image src={persona.avatar_url} alt="" fill sizes={`${CW}px`} className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xl font-bold"
            style={{ background: gc ? `${gc}33` : "var(--muted)", color: gc ?? "var(--muted-foreground)" }}>
            {getInitials(persona.name)}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 px-1.5 pb-1.5 pt-5"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)" }}>
          <span className="line-clamp-2 text-[9px] font-semibold leading-tight text-white drop-shadow-sm">{persona.name}</span>
        </div>
        {relationCount > 0 && (
          <span className="absolute right-1 bottom-1 rounded-full bg-black/50 px-1 text-[9px] font-medium tabular-nums text-white/80" title={t("relationCount", { count: relationCount })}>
            {relationCount}
          </span>
        )}
      </div>
      {pendingCount > 0 && (
        <span className="absolute left-1 top-1 z-20 rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground" title={t("pendingCount", { count: pendingCount })}>
          {pendingCount}
        </span>
      )}
      {pendingCount === 0 && (
        <PersonaStatusBadge status={persona.narrative_status} compact className="absolute left-1 top-1 z-20 bg-black/60 text-white dark:text-white" />
      )}
      {corner && <div className="absolute right-1 top-0 z-20">{corner}</div>}
    </div>
  );
}
