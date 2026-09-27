"use client";

import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { cn } from "@/lib/utils";

/**
 * Un rôle en puce : sa couleur en point (ou son icône), son nom.
 *
 * `size="sm"` pour les cartes de membres, où plusieurs puces se suivent ;
 * `size="md"` pour les listes de réglages. `plain` retire la pastille
 * (bordure, fond, marges) : point et nom seuls, pour une ligne de liste.
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
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 font-medium",
        plain
          ? size === "sm" ? "text-[11px]" : "text-xs"
          : cn("rounded-full border border-border-soft bg-muted/40", size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"),
        className,
      )}
      style={plain ? undefined : { borderColor: `${role.color}55` }}
    >
      {role.lucide_icon ? (
        <LazyLucideIcon
          name={role.lucide_icon}
          width={size === "sm" ? 12 : 14}
          height={size === "sm" ? 12 : 14}
          className="shrink-0"
          style={{ color: role.color }}
        />
      ) : (
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
