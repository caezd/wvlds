"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bandeau d'affichage (lecture seule) des étiquettes d'avertissement de
 * contenu. Utilisé au-dessus d'un message normal, et au-dessus d'un bloc de
 * messages SMS (liste agrégée, voir aggregateContentWarnings).
 */
export function ContentWarningBanner({ tags, className }: { tags: string[]; className?: string }) {
  const t = useTranslations("chatrooms");
  if (!tags.length) return null;
  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap text-xs text-amber-700 dark:text-amber-400", className)}>
      <AlertTriangle className="h-3 w-3 shrink-0" />
      <span className="font-medium">{t("contentWarningPrefix")}</span>
      {tags.map((tag, i) => (
        <span key={`${tag}-${i}`} className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5">
          {tag}
        </span>
      ))}
    </div>
  );
}
