"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { MapLinkTarget } from "@/lib/wikiLinks";

/**
 * Les lieux de la carte qu'un `[[lieu:…]]` peut viser — identifiant, titre
 * et carte, jamais plus.
 *
 * Lus une fois par monde et par montage, là où les liens se rendent : le
 * wiki et les salons. La RLS n'en rend que ce que le lecteur a le droit de
 * voir, et un lieu posé pendant qu'on lit ne sera connu qu'à la prochaine
 * ouverture — le prix d'un canal de moins.
 */
export function useMapLinkTargets(worldId: string): MapLinkTarget[] {
  const [targets, setTargets] = React.useState<MapLinkTarget[]>([]);

  React.useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from("world_map_pins")
        .select("id, title, map_id")
        .eq("world_id", worldId);
      if (!cancelled) setTargets((data ?? []) as MapLinkTarget[]);
    })();
    return () => { cancelled = true; };
  }, [worldId]);

  return targets;
}

/** L'adresse qui ouvre la carte sur ce lieu. */
export function mapLinkHref(worldId: string, target: MapLinkTarget): string {
  return `/w/${worldId}?view=map&map=${target.map_id}&pin=${target.id}`;
}
