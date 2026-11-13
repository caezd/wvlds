"use client";

import { useTranslations } from "next-intl";
import { Ghost, HelpCircle, Skull, type LucideIcon } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PersonaNarrativeStatus } from "@/types/db";

const ICONS: Record<Exclude<PersonaNarrativeStatus, "alive">, LucideIcon> = {
  missing: HelpCircle,
  dead: Skull,
  retired: Ghost,
};

const TONES: Record<Exclude<PersonaNarrativeStatus, "alive">, BadgeProps["tone"]> = {
  missing: "warning",
  dead: "danger",
  retired: "neutral",
};

/**
 * Le statut narratif en pastille — rien pour « vivant », le cas ordinaire.
 * `compact` : l'icône seule, le libellé au survol (en-tête d'un message).
 */
export function PersonaStatusBadge({
  status,
  compact = false,
  className,
}: {
  status: PersonaNarrativeStatus | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("personas.narrativeStatus");
  if (!status || status === "alive") return null;
  const Icon = ICONS[status];
  const label = t(status);
  return (
    <Badge
      tone={TONES[status]}
      data-narrative-status={status}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
      className={cn(compact && "h-4 px-0.5", className)}
    >
      <Icon aria-hidden />
      {!compact && <span className="truncate">{label}</span>}
    </Badge>
  );
}
