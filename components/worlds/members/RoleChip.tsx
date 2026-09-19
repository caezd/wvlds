"use client";

import { LazyLucideIcon } from "@/components/ui/LazyLucideIcon";
import { cn } from "@/lib/utils";

/**
 * Un rôle en puce : sa couleur en point (ou son icône), son nom.
 *
 * `size="sm"` pour les cartes de membres, où plusieurs puces se suivent ;
 * `size="md"` pour les listes de réglages.
 */
export function RoleChip({
  role,
  size = "sm",
  className,
}: {
  role: { name: string; color: string; lucide_icon?: string | null };
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border-soft bg-muted/40 font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={{ borderColor: `${role.color}55` }}
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
