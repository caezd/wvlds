"use client";

import { Badge, BadgeDot } from "@/components/ui/badge";
import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { cn } from "@/lib/utils";

/**
 * Un rôle en puce : sa couleur en point (ou son icône), son nom.
 *
 * En puce, c'est le badge commun (`neutral`, la couleur réduite à la
 * pastille). `plain` retire le badge : point et nom seuls, pour une ligne de
 * liste ; `size="md"` y grossit le point et le texte (listes de réglages).
 */
export function RoleChip({
  role,
  size = "sm",
  plain = false,
  className,
}: {
  role: { name: string; color: string; lucide_icon?: string | null };
  size?: "sm" | "md";
  plain?: boolean;
  className?: string;
}) {
  const icon = role.lucide_icon ? (
    <LazyLucideIcon
      name={role.lucide_icon}
      width={size === "sm" || !plain ? 12 : 14}
      height={size === "sm" || !plain ? 12 : 14}
      className="shrink-0"
      style={{ color: role.color }}
    />
  ) : null;

  if (!plain) {
    return (
      <Badge className={className}>
        {icon ?? <BadgeDot color={role.color} />}
        <span className="truncate">{role.name}</span>
      </Badge>
    );
  }

  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 font-medium", size === "sm" ? "text-xs-plus" : "text-xs", className)}>
      {icon ?? (
        <span
          aria-hidden
          className={cn("shrink-0 rounded-full", size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5")}
          style={{ backgroundColor: role.color }}
        />
      )}
      <span className="truncate">{role.name}</span>
    </span>
  );
}
