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
import { cn } from "@/lib/utils";
import type { World } from "@/types/worlds";
import { messageErreurAction } from "@/lib/actionErrors";
import { ToggleItem, ToggleList } from "./FeatureLayout";

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
  const tCommun = useTranslations("common");
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
      toast.error(messageErreurAction(res.error, tCommun));
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
      toast.error(messageErreurAction(res.error, tCommun));
      return;
    }
    onUpdated?.({ ...world, home_grid_gap: next });
  }

  return (
    <div className="space-y-6">
      <ToggleList>
        <ToggleItem
          title={t("home.showStats")}
          help={t("home.showStatsDesc")}
          checked={showStats}
          disabled={togglingStats}
          onCheckedChange={(v) => void handleToggleStats(v)}
        />
        <ToggleItem
          title={t("home.gridGap")}
          help={t("home.gridGapDesc")}
          control={
            <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={t("home.gridGap")}>
              {GAP_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={gap === option}
                  disabled={savingGap}
                  onClick={() => void handleChangeGap(option)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
                    gap === option
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`home.gridGapOptions.${option}`)}
                </button>
              ))}
            </div>
          }
        />
      </ToggleList>

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
