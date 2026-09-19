"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock, FileText, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { sheetBadgeOf, type PersonaSheetBadgeKind } from "@/lib/personaReview";

const ICONS: Record<PersonaSheetBadgeKind, LucideIcon> = {
  incomplete: AlertTriangle,
  draft: FileText,
  submitted: Clock,
  approved: CheckCircle2,
};

const TONES: Record<PersonaSheetBadgeKind, string> = {
  incomplete: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  draft: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  submitted: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

/**
 * L'état de la fiche en pastille : incomplète, brouillon, en relecture. Rien
 * pour une fiche validée et complète — le cas ordinaire — sauf `showApproved`.
 * `compact` : l'icône seule, le libellé au survol.
 */
export function PersonaSheetBadge({
  persona,
  compact = false,
  showApproved = false,
  className,
}: {
  persona: { review_status?: unknown; sheet_complete?: boolean | null };
  compact?: boolean;
  showApproved?: boolean;
  className?: string;
}) {
  const t = useTranslations("personas.sheet");
  const kind = sheetBadgeOf(persona) ?? (showApproved ? "approved" : null);
  if (!kind) return null;
  const Icon = ICONS[kind];
  const label = t(kind);
  return (
    <span
      data-sheet-status={kind}
      title={compact ? label : t(`${kind}Hint`)}
      aria-label={compact ? label : undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full font-medium",
        compact ? "p-0.5" : "px-2 py-0.5 text-[11px]",
        TONES[kind],
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {!compact && <span className="truncate">{label}</span>}
    </span>
  );
}
