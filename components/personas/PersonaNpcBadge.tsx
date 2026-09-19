"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * « PNJ » en pastille : un personnage non-joueur partagé du monde (migration
 * 182). Rien pour un persona ordinaire. `compact` : l'icône seule.
 */
export function PersonaNpcBadge({
  isNpc,
  compact = false,
  className,
}: {
  isNpc: boolean | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("personas.npc");
  if (!isNpc) return null;
  const label = t("badge");
  return (
    <span
      data-npc
      title={compact ? label : t("badgeHint")}
      aria-label={compact ? label : undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full font-medium bg-violet-500/15 text-violet-700 dark:text-violet-300",
        compact ? "p-0.5" : "px-2 py-0.5 text-[11px]",
        className,
      )}
    >
      <Users className="h-3 w-3 shrink-0" aria-hidden />
      {!compact && <span className="truncate">{label}</span>}
    </span>
  );
}
