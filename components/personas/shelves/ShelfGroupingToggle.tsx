"use client";

import { useTranslations } from "next-intl";
import { List, Shapes, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { SHELF_MODES, type ShelfMode } from "./buildShelves";

const ICONS: Record<ShelfMode, LucideIcon> = { player: Users, group: Shapes, list: List };
const LABEL_KEYS = { player: "byPlayer", group: "byGroup", list: "list" } as const;

/** Par joueur | Par groupe | Liste — un sélecteur segmenté. */
export function ShelfGroupingToggle({ mode, onModeChange, modes = SHELF_MODES }: { mode: ShelfMode; onModeChange: (next: ShelfMode) => void; modes?: readonly ShelfMode[] }) {
  const t = useTranslations("personas.list.shelves");
  return (
    <div role="radiogroup" aria-label={t("grouping")} className="flex h-9 shrink-0 items-center gap-0.5 rounded-md border border-input p-0.5">
      {modes.map((m) => {
        const Icon = ICONS[m];
        const on = m === mode;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onModeChange(m)}
            className={cn(
              "flex h-full items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className={cn(!on && "sr-only sm:not-sr-only")}>{t(LABEL_KEYS[m])}</span>
          </button>
        );
      })}
    </div>
  );
}
