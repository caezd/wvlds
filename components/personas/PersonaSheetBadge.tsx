"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock, FileText, type LucideIcon } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { sheetBadgeOf, type PersonaSheetBadgeKind } from "@/lib/personaReview";

const ICONS: Record<PersonaSheetBadgeKind, LucideIcon> = {
  incomplete: AlertTriangle,
  draft: FileText,
  submitted: Clock,
  approved: CheckCircle2,
};

const TONES: Record<PersonaSheetBadgeKind, BadgeProps["tone"]> = {
  incomplete: "warning",
  draft: "neutral",
  submitted: "warning",
  approved: "success",
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
  reviewActive = true,
  className,
}: {
  persona: { review_status?: unknown; sheet_complete?: boolean | null };
  compact?: boolean;
  showApproved?: boolean;
  /** Le monde relit-il ses fiches (migration 184) ? Sinon, seule « incomplète » s'affiche. */
  reviewActive?: boolean;
  className?: string;
}) {
  const t = useTranslations("personas.sheet");
  const kind = sheetBadgeOf(persona, reviewActive) ?? (showApproved && reviewActive ? "approved" : null);
  if (!kind) return null;
  const Icon = ICONS[kind];
  const label = t(kind);
  return (
    <Badge
      tone={TONES[kind]}
      data-sheet-status={kind}
      title={compact ? label : t(`${kind}Hint`)}
      aria-label={compact ? label : undefined}
      className={cn(compact && "h-4 px-0.5", className)}
    >
      <Icon aria-hidden />
      {!compact && <span className="truncate">{label}</span>}
    </Badge>
  );
}

const BANNER_ICON_TONES: Record<PersonaSheetBadgeKind, string> = {
  incomplete: "text-warning",
  draft: "text-muted-foreground",
  submitted: "text-warning",
  approved: "text-success",
};

/**
 * L'état de la fiche en bandeau, en tête de l'onglet de relecture : l'icône,
 * l'état en gras, son explication, et à droite ce qu'on peut y faire
 * (`actions` : valider, renvoyer).
 */
export function PersonaSheetStatusBanner({
  persona,
  actions,
}: {
  persona: { review_status?: unknown; sheet_complete?: boolean | null };
  actions?: ReactNode;
}) {
  const t = useTranslations("personas.sheet");
  const kind = sheetBadgeOf(persona, true) ?? "approved";
  const Icon = ICONS[kind];
  return (
    <div
      data-sheet-status={kind}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-4 py-3"
    >
      <Icon className={cn("h-4 w-4 shrink-0", BANNER_ICON_TONES[kind])} aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold text-foreground">{t(kind)}</span>
        <span className="text-muted-foreground"> · {t(`${kind}Hint`)}</span>
      </p>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
