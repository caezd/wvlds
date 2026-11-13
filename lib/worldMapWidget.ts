import type { SupabaseClient } from "@supabase/supabase-js";

// Hors du module « use client » du bloc « Carte » : la page d'un monde
// l'appelle côté serveur, ce qu'une fonction exportée par un module client ne
// permet pas (vue du serveur, ce n'est qu'une référence).

/** Ce que le bloc sait d'une carte : de quoi la montrer et la compter. */
export type MapWidgetMap = {
  id: string;
  label: string;
  image_url: string | null;
  pin_count: number;
};

/**
 * Charge les cartes d'un monde et le nombre de lieux de chacune.
 *
 * Partagé entre le rendu serveur (`WorldHomeContent`) et le bloc lui-même, qui
 * charge seul quand il vient d'être ajouté à la grille sans rechargement de
 * page. Le compte se fait ici et non par une requête d'agrégat : PostgREST ne
 * groupe pas, et lire un identifiant par épingle reste dérisoire.
 */
export async function loadMapWidgetData(supabase: SupabaseClient, worldId: string): Promise<MapWidgetMap[]> {
  const [{ data: maps }, { data: pins }] = await Promise.all([
    supabase
      .from("world_maps")
      .select("id, label, image_url")
      .eq("world_id", worldId)
      .order("sort_index"),
    supabase.from("world_map_pins").select("map_id").eq("world_id", worldId),
  ]);
  const parCarte = new Map<string, number>();
  for (const p of (pins ?? []) as { map_id: string }[]) {
    parCarte.set(p.map_id, (parCarte.get(p.map_id) ?? 0) + 1);
  }
  return ((maps ?? []) as Omit<MapWidgetMap, "pin_count">[]).map((m) => ({
    ...m,
    pin_count: parCarte.get(m.id) ?? 0,
  }));
}
