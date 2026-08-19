"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setWorldHomeGridGap, setWorldHomeShowStats } from "@/app/actions/worldCatalog";
import { WorldHomeGridEditor } from "@/components/worlds/home/WorldHomeGridEditor";
import {
  resolveHomeGridGap,
  resolveWorldHomeGrid,
  type WorldHomeGridGap,
  type WorldHomeGridItem,
} from "@/components/worlds/home/worldHomeGrid";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { World } from "@/types/worlds";

const GAP_OPTIONS: WorldHomeGridGap[] = ["compact", "comfortable", "spacious"];

/** Enrobe WorldHomeGridEditor pour l'onglet Réglages : état local +
 *  rafraîchissement de la page d'accueil (autre vue, même monde) après
 *  chaque changement confirmé en base. Porte aussi les réglages qui ne sont
 *  pas des blocs de la grille elle-même : l'affichage des statistiques
 *  (case à cocher — voir WorldHome.tsx, la zone reste fixe sous le titre)
 *  et l'espacement entre les blocs (partagé avec le rendu public, voir
 *  HOME_GRID_GAP_PRESETS dans worldHomeGrid.ts). */
export function WorldHomeGridSettings({
  world,
  onUpdated,
}: {
  world: World;
  onUpdated?: (world: World) => void;
}) {
  const router = useRouter();
  const t = useTranslations("worlds");
  const [items, setItems] = React.useState<WorldHomeGridItem[]>(() =>
    resolveWorldHomeGrid(world.home_grid, world.home_layout, world.announcement_html),
  );
  const [showStats, setShowStats] = React.useState(world.home_show_stats === true);
  const [togglingStats, setTogglingStats] = React.useState(false);
  const [gap, setGap] = React.useState<WorldHomeGridGap>(() => resolveHomeGridGap(world.home_grid_gap));
  const [savingGap, setSavingGap] = React.useState(false);

  async function handleToggleStats(enabled: boolean) {
    setTogglingStats(true);
    const res = await setWorldHomeShowStats(world.id, enabled);
    setTogglingStats(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setShowStats(enabled);
    onUpdated?.({ ...world, home_show_stats: enabled });
  }

  async function handleChangeGap(next: WorldHomeGridGap) {
    if (next === gap) return;
    const previous = gap;
    setGap(next);
    setSavingGap(true);
    const res = await setWorldHomeGridGap(world.id, next);
    setSavingGap(false);
    if (!res.ok) {
      setGap(previous);
      toast.error(res.error);
      return;
    }
    onUpdated?.({ ...world, home_grid_gap: next });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border-soft bg-muted/20 p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("home.showStats")}</p>
          <p className="text-xs leading-snug text-muted-foreground">{t("home.showStatsDesc")}</p>
        </div>
        <Switch
          checked={showStats}
          disabled={togglingStats}
          onCheckedChange={(v) => void handleToggleStats(v)}
          className="mt-0.5 shrink-0"
        />
      </div>

      <div className="space-y-2 rounded-xl border border-border-soft bg-muted/20 p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("home.gridGap")}</p>
          <p className="text-xs leading-snug text-muted-foreground">{t("home.gridGapDesc")}</p>
        </div>
        <div className="flex gap-1.5" role="radiogroup" aria-label={t("home.gridGap")}>
          {GAP_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={gap === option}
              disabled={savingGap}
              onClick={() => void handleChangeGap(option)}
              className={cn(
                "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                gap === option
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border-soft text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {t(`home.gridGapOptions.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <WorldHomeGridEditor
        worldId={world.id}
        items={items}
        onItemsChange={setItems}
        onPersisted={() => router.refresh()}
        gap={gap}
      />
    </div>
  );
}
