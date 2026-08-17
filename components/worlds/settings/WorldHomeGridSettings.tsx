"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { WorldHomeGridEditor } from "@/components/worlds/home/WorldHomeGridEditor";
import { resolveWorldHomeGrid, type WorldHomeGridItem } from "@/components/worlds/home/worldHomeGrid";
import type { World } from "@/types/worlds";

/** Enrobe WorldHomeGridEditor pour l'onglet Réglages : état local +
 *  rafraîchissement de la page d'accueil (autre vue, même monde) après
 *  chaque changement confirmé en base. */
export function WorldHomeGridSettings({ world }: { world: World }) {
  const router = useRouter();
  const [items, setItems] = React.useState<WorldHomeGridItem[]>(() =>
    resolveWorldHomeGrid(world.home_grid, world.home_layout, world.announcement_html),
  );

  return (
    <WorldHomeGridEditor
      worldId={world.id}
      items={items}
      onItemsChange={setItems}
      onPersisted={() => router.refresh()}
    />
  );
}
