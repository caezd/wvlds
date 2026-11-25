"use client";

import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useTaxBadge } from "@/lib/taxBadgeStore";
import { cn } from "@/lib/utils";

/**
 * Un persona en défaut de taxe (migration 255) : une pastille à côté de son
 * nom, au texte choisi par le monde (« Impayé » par défaut). Rien sinon.
 * `compact` : l'icône seule.
 */
export function PersonaTaxBadge({
  personaId,
  compact = false,
  className,
}: {
  personaId: string | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("personas.tax");
  const badge = useTaxBadge(personaId);
  if (!badge) return null;
  const label = badge.label ?? t("badge");
  return (
    <Badge
      tone="danger"
      data-tax-overdue
      title={t("badgeHint", { periods: badge.periods })}
      aria-label={compact ? label : undefined}
      className={cn(compact && "h-4 px-0.5", className)}
    >
      <CircleAlert aria-hidden />
      {!compact && <span className="truncate">{label}</span>}
    </Badge>
  );
}
