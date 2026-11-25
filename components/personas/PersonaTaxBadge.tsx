"use client";

import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { withOpacity } from "@/lib/colorOpacity";
import { useTaxBadge } from "@/lib/taxBadgeStore";
import { cn } from "@/lib/utils";

/**
 * Le badge de défaut de taxe tel qu'il s'affiche : texte, couleur et icône
 * choisis par le monde (migrations 255-256), sinon ceux de l'application.
 * Sert aussi d'aperçu dans les réglages.
 */
export function TaxBadgeView({
  label,
  color,
  icon,
  hint,
  compact = false,
  className,
}: {
  label: string;
  color: string | null;
  icon: string | null;
  hint?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Badge
      tone={color ? "neutral" : "danger"}
      data-tax-overdue
      title={hint}
      aria-label={compact ? label : undefined}
      style={color ? { color, backgroundColor: withOpacity(color, 0.15) } : undefined}
      className={cn(compact && "h-4 px-0.5", className)}
    >
      {icon ? <LazyLucideIcon name={icon} aria-hidden /> : <CircleAlert aria-hidden />}
      {!compact && <span className="truncate">{label}</span>}
    </Badge>
  );
}

/**
 * Un persona en défaut de taxe : une pastille à côté de son nom. Rien sinon.
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
  return (
    <TaxBadgeView
      label={badge.label ?? t("badge")}
      color={badge.color}
      icon={badge.icon}
      hint={t("badgeHint", { periods: badge.periods })}
      compact={compact}
      className={className}
    />
  );
}
