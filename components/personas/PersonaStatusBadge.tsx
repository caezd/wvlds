"use client";

import { useTranslations } from "next-intl";
import { Ghost, HelpCircle, Skull, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PersonaNarrativeStatus } from "@/types/db";

const ICONS: Record<Exclude<PersonaNarrativeStatus, "alive">, LucideIcon> = {
  missing: HelpCircle,
  dead: Skull,
  retired: Ghost,
};

const TONES: Record<Exclude<PersonaNarrativeStatus, "alive">, string> = {
  missing: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  dead: "bg-red-500/15 text-red-700 dark:text-red-300",
  retired: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
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
    <span
      data-narrative-status={status}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full font-medium",
        compact ? "p-0.5" : "px-2 py-0.5 text-[11px]",
        TONES[status],
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {!compact && <span className="truncate">{label}</span>}
    </span>
  );
}
