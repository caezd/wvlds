"use client";

import { useTranslations } from "next-intl";
import { List, Shapes, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type CommunityView = "players" | "groups" | "alpha";
export const COMMUNITY_VIEWS: readonly CommunityView[] = ["players", "groups", "alpha"];

export function isCommunityView(value: unknown): value is CommunityView {
  return typeof value === "string" && (COMMUNITY_VIEWS as readonly string[]).includes(value);
}

const ICONS: Record<CommunityView, LucideIcon> = { players: Users, groups: Shapes, alpha: List };

/** Joueurs | Groupes | Liste — un sélecteur segmenté. */
export function CommunityViewToggle({
  view,
  onViewChange,
  views = COMMUNITY_VIEWS,
}: {
  view: CommunityView;
  onViewChange: (next: CommunityView) => void;
  views?: readonly CommunityView[];
}) {
  const t = useTranslations("worlds.community");
  return (
    <div role="radiogroup" aria-label={t("viewsLabel")} className="flex h-9 shrink-0 items-center gap-0.5 rounded-md border border-input p-0.5">
      {views.map((v) => {
        const Icon = ICONS[v];
        const on = v === view;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onViewChange(v)}
            className={cn(
              "flex h-full items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className={cn(!on && "sr-only sm:not-sr-only")}>{t(`views.${v}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
