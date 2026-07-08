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
    <div className={cn("flex items-center flex-wrap text-xs text-amber-700 dark:text-amber-400 mb-2")}>
      <AlertTriangle className="h-4 w-4 shrink-0 mr-2" />
      {tags.map((tag, i) => (
        <span key={`${tag}-${i}`} className="px-0.5">
          {tag}{i < tags.length - 1 ? "," : ""}
        </span>
      ))}
    </div>
  );
}
