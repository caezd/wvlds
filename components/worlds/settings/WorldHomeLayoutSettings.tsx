"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { WorldHomeLayoutEditor } from "@/components/worlds/home/WorldHomeLayoutEditor";
import { resolveWorldHomeLayout, type WorldHomeWidgetId } from "@/components/worlds/home/worldHomeWidgets";
import type { World } from "@/types/worlds";

/** Enrobe WorldHomeLayoutEditor pour l'onglet Réglages : état local +
 *  rafraîchissement de la page d'accueil (autre vue, même monde) après
 *  chaque changement confirmé en base. */
export function WorldHomeLayoutSettings({ world }: { world: World }) {
  const router = useRouter();
  const [layout, setLayout] = React.useState<WorldHomeWidgetId[]>(() => resolveWorldHomeLayout(world.home_layout));

  return (
    <WorldHomeLayoutEditor
      worldId={world.id}
      layout={layout}
      onLayoutChange={setLayout}
      onPersisted={() => router.refresh()}
    />
  );
}
