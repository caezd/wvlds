"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setWorldHomeShowStats } from "@/app/actions/worldCatalog";
import { WorldHomeGridEditor } from "@/components/worlds/home/WorldHomeGridEditor";
import { resolveWorldHomeGrid, type WorldHomeGridItem } from "@/components/worlds/home/worldHomeGrid";
import { Switch } from "@/components/ui/switch";
import type { World } from "@/types/worlds";

/** Enrobe WorldHomeGridEditor pour l'onglet Réglages : état local +
 *  rafraîchissement de la page d'accueil (autre vue, même monde) après
 *  chaque changement confirmé en base. Porte aussi le réglage d'affichage
 *  des statistiques — plus un bloc de la grille, mais une case à cocher
 *  ici (voir WorldHome.tsx : la zone reste fixe, sous le titre). */
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

      <WorldHomeGridEditor
        worldId={world.id}
        items={items}
        onItemsChange={setItems}
        onPersisted={() => router.refresh()}
      />
    </div>
  );
}
