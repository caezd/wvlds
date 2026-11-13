"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
    <Badge
      tone="npc"
      data-npc
      title={compact ? label : t("badgeHint")}
      aria-label={compact ? label : undefined}
      className={cn(compact && "h-4 px-0.5", className)}
    >
      <Users aria-hidden />
      {!compact && <span className="truncate">{label}</span>}
    </Badge>
  );
}
