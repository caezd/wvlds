"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";

export type WorldMapData = {
  id: string;
  world_id: string;
  image_url: string | null;
  label: string;
  /** Ordre des onglets — voir migration 151. */
  sort_index: number;
};

export type MapPin = {
  id: string;
  world_id: string;
  /** La carte sur laquelle ce lieu est posé — voir migration 151. */
  map_id: string;
  x: number;
  y: number;
  title: string;
  description: string | null;
  banner_url: string | null;
  color: string;
  icon: string;
  icon_color: string;
  border_color: string | null;
  border_style: string;
  sort_index: number;
  /** La page du wiki que ce lieu raconte — voir migration 150. */
  wiki_page_id: string | null;
};

/**
 * Toutes les cartes d'un monde et toutes leurs épingles, en deux requêtes.
 *
 * Les épingles sont lues d'un bloc plutôt qu'une carte à la fois : passer d'un
 * onglet à l'autre est alors instantané, là où une requête par changement
 * d'onglet ferait clignoter la carte à chaque aller-retour. Elles se répartissent
 * ensuite par `map_id`.
 */
export async function getWorldMaps(
  worldId: string,
): Promise<{ maps: WorldMapData[]; pins: MapPin[] }> {
  const supabase = await createClient();
  const [{ data: maps }, { data: pins }] = await Promise.all([
    supabase.from("world_maps").select("*").eq("world_id", worldId).order("sort_index"),
    supabase
      .from("world_map_pins")
      .select("*")
      .eq("world_id", worldId)
      .order("sort_index"),
  ]);
  return { maps: (maps as WorldMapData[]) ?? [], pins: (pins as MapPin[]) ?? [] };
}

/**
 * Garde d'authentification commune aux mutations.
 *
 * La RLS fait l'essentiel du travail — elle seule décide qui écrit quoi — mais
 * une session absente donnerait une erreur Postgres incompréhensible dans un
 * `toast`. Un code, et non une phrase : le message d'une exception finit
 * affiché tel quel, et une phrase y arriverait en français quelle que soit la
 * langue lue.
 */
async function requireUser(supabase: SupabaseClient): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(ERR_NON_AUTHENTIFIE);
}

export async function createWorldMap(
  worldId: string,
  patch: Partial<Pick<WorldMapData, "image_url" | "label" | "sort_index">> = {},
): Promise<WorldMapData> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { data, error } = await supabase
    .from("world_maps")
    .insert({ world_id: worldId, ...patch })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as WorldMapData;
}

export async function updateWorldMap(
  mapId: string,
  patch: Partial<Pick<WorldMapData, "image_url" | "label" | "sort_index">>,
): Promise<WorldMapData> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { data, error } = await supabase
    .from("world_maps")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", mapId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as WorldMapData;
}

/** Supprime une carte ; ses épingles suivent (`ON DELETE CASCADE`). */
export async function deleteWorldMap(mapId: string): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { error } = await supabase.from("world_maps").delete().eq("id", mapId);
  if (error) throw new Error(error.message);
}

export async function createMapPin(
  worldId: string,
  mapId: string,
  x: number,
  y: number,
  title: string,
): Promise<MapPin> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { data, error } = await supabase
    .from("world_map_pins")
    .insert({ world_id: worldId, map_id: mapId, x, y, title })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as MapPin;
}

export async function updateMapPin(
  pinId: string,
  patch: Partial<Pick<MapPin, "x" | "y" | "title" | "description" | "banner_url" | "color" | "icon" | "icon_color" | "border_color" | "border_style" | "wiki_page_id">>,
): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("world_map_pins")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", pinId);

  if (error) throw new Error(error.message);
}

export async function deleteMapPin(pinId: string): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("world_map_pins")
    .delete()
    .eq("id", pinId);

  if (error) throw new Error(error.message);
}
