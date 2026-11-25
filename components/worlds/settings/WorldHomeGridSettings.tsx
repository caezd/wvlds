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
import type { World } from "@/types/worlds";
import { messageErreurAction } from "@/lib/actionErrors";
import { SettingsSection, SettingsSegmented, ToggleItem, ToggleList } from "./FeatureLayout";

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
      <SettingsSection title={t("home.display")}>
        <ToggleList>
          <ToggleItem
            title={t("home.showStats")}
            description={t("home.showStatsDesc")}
            checked={showStats}
            disabled={togglingStats}
            onCheckedChange={(v) => void handleToggleStats(v)}
          />
          <ToggleItem
            title={t("home.gridGap")}
            control={
              <SettingsSegmented
                label={t("home.gridGap")}
                value={gap}
                options={GAP_OPTIONS.map((option) => ({ value: option, label: t(`home.gridGapOptions.${option}`) }))}
                onValueChange={(v) => void handleChangeGap(v)}
                disabled={savingGap}
              />
            }
          />
        </ToggleList>
      </SettingsSection>

      <SettingsSection title={t("home.blocks")} layout="stacked">
        <WorldHomeGridEditor
          worldId={world.id}
          items={items}
          onItemsChange={setItems}
          onPersisted={() => router.refresh()}
          gap={gap}
        />
      </SettingsSection>
    </div>
  );
}
