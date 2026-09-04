"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";
import { storagePathFromUrl } from "@/lib/storage";

/** Espace de stockage des images de carte et des bannières de lieu. */
const WORLDS_BUCKET = "worlds";

export type WorldMapData = {
  id: string;
  world_id: string;
  image_url: string | null;
  label: string;
  /** Ordre des onglets — voir migration 151. */
  sort_index: number;
  /** Ce que la largeur de la carte représente, et en quoi — voir migration 155. */
  scale_width_units: number | null;
  scale_unit: string | null;
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
  /** La carte que ce lieu ouvre — voir migration 153. */
  target_map_id: string | null;
};

/** Ce que la carte montre d'un persona : sa tête, et où il se trouve. */
export type MapPersona = {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  frame: { asset_url: string | null } | null;
  /** Le lieu où il se trouve — `null` quand il n'est nulle part (migration 154). */
  map_pin_id: string | null;
};

const MAP_PERSONA_SELECT = "id, user_id, name, avatar_url, map_pin_id, frame:avatar_frame_id(asset_url)";

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
): Promise<{ maps: WorldMapData[]; pins: MapPin[]; personas: MapPersona[] }> {
  const supabase = await createClient();
  const [{ data: maps }, { data: pins }, { data: personas }] = await Promise.all([
    supabase.from("world_maps").select("*").eq("world_id", worldId).order("sort_index"),
    supabase
      .from("world_map_pins")
      .select("*")
      .eq("world_id", worldId)
      .order("sort_index"),
    // Ceux qui se trouvent quelque part, cartes confondues : la RLS n'en rend
    // que ce que le lecteur a le droit de voir.
    supabase
      .from("personas")
      .select(MAP_PERSONA_SELECT)
      .eq("world_id", worldId)
      .eq("is_template", false)
      .is("deleted_at", null)
      .not("map_pin_id", "is", null),
  ]);
  return {
    maps: (maps as WorldMapData[]) ?? [],
    pins: (pins as MapPin[]) ?? [],
    personas: (personas as unknown as MapPersona[]) ?? [],
  };
}

/**
 * Mes personas de ce monde, placés ou non — ceux que je peux poser sur un
 * lieu. La RLS ne me laissera de toute façon écrire que les miens ; la liste
 * s'y tient d'emblée plutôt que d'offrir un choix qui échouerait.
 */
export async function getMyMapPersonas(worldId: string): Promise<MapPersona[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("personas")
    .select(MAP_PERSONA_SELECT)
    .eq("world_id", worldId)
    .eq("user_id", user.id)
    .eq("is_template", false)
    .is("deleted_at", null)
    .order("name");
  return (data as unknown as MapPersona[]) ?? [];
}

/**
 * Le persona placé, relu avec son cadre.
 *
 * L'écho temps réel d'une ligne `personas` ne porte pas la jointure sur le
 * cadre de l'avatar : la carte relit le persona qui vient de bouger.
 */
export async function getMapPersona(personaId: string): Promise<MapPersona | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("personas")
    .select(MAP_PERSONA_SELECT)
    .eq("id", personaId)
    .maybeSingle();
  return (data as unknown as MapPersona | null) ?? null;
}

/**
 * Pose un persona sur un lieu — ou l'en retire avec `null`.
 *
 * Pas de contrôle de propriété ici : `personas_update_own` ne laisse écrire
 * que ses propres personas, et rend l'erreur que l'on propage.
 */
export async function setPersonaLocation(personaId: string, pinId: string | null): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { error } = await supabase
    .from("personas")
    .update({ map_pin_id: pinId })
    .eq("id", personaId);
  if (error) throw new Error(error.message);
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
  patch: Partial<Pick<WorldMapData, "image_url" | "label" | "sort_index" | "scale_width_units" | "scale_unit">>,
): Promise<WorldMapData> {
  const supabase = await createClient();
  await requireUser(supabase);

  // L'image d'avant, à effacer si celle-ci la remplace : rien ne la lisait
  // plus, et elle occupait le stockage pour toujours.
  const remplaceImage = patch.image_url !== undefined;
  const { data: avant } = remplaceImage
    ? await supabase.from("world_maps").select("image_url").eq("id", mapId).maybeSingle()
    : { data: null };

  const { data, error } = await supabase
    .from("world_maps")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", mapId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  const ancienne = (avant as { image_url: string | null } | null)?.image_url;
  if (ancienne && ancienne !== patch.image_url) {
    await removeStoredFiles(supabase, [ancienne]);
  }
  return data as WorldMapData;
}

/**
 * Fixe l'ordre des onglets, du premier au dernier.
 *
 * Une mise à jour par carte plutôt qu'un `upsert` en lot : PostgREST traduit
 * l'upsert en `INSERT … ON CONFLICT`, ce qui ferait évaluer à la RLS une
 * policy d'INSERT sur des lignes partielles — le piège documenté dans
 * `components/worlds/wiki/pasDUpsert.test.ts`. À dix cartes au plus, la boucle
 * ne coûte rien.
 */
export async function reorderWorldMaps(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const horodatage = new Date().toISOString();
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await supabase
      .from("world_maps")
      .update({ sort_index: index, updated_at: horodatage })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
}

/**
 * Supprime une carte ; ses épingles suivent (`ON DELETE CASCADE`).
 *
 * Les fichiers, eux, ne suivent personne : `CASCADE` ne parle qu'à Postgres. On
 * relève donc l'image de la carte et les bannières de ses lieux AVANT de
 * supprimer la ligne, faute de quoi plus rien ne dirait quels objets effacer.
 */
export async function deleteWorldMap(mapId: string): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const [{ data: carte }, { data: epingles }] = await Promise.all([
    supabase.from("world_maps").select("image_url").eq("id", mapId).maybeSingle(),
    supabase.from("world_map_pins").select("banner_url").eq("map_id", mapId),
  ]);

  const { error } = await supabase.from("world_maps").delete().eq("id", mapId);
  if (error) throw new Error(error.message);

  await removeStoredFiles(supabase, [
    (carte as { image_url: string | null } | null)?.image_url ?? null,
    ...((epingles as { banner_url: string | null }[] | null) ?? []).map((p) => p.banner_url),
  ]);
}

/**
 * Efface des fichiers du bucket des mondes, d'après leurs URL publiques.
 *
 * Le ménage ne fait jamais échouer l'opération qui l'a déclenché : la ligne est
 * déjà supprimée en base, et rendre une erreur ici afficherait « suppression
 * impossible » pour une carte qui a bel et bien disparu. Un fichier resté en
 * place est un déchet, pas une panne.
 */
async function removeStoredFiles(
  supabase: SupabaseClient,
  urls: (string | null | undefined)[],
): Promise<void> {
  const chemins = urls
    .map((u) => storagePathFromUrl(u, WORLDS_BUCKET))
    .filter((c): c is string => !!c);
  if (chemins.length === 0) return;
  try {
    await supabase.storage.from(WORLDS_BUCKET).remove(chemins);
  } catch {
    // Volontairement muet — voir ci-dessus.
  }
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
  patch: Partial<Pick<MapPin, "x" | "y" | "title" | "description" | "banner_url" | "color" | "icon" | "icon_color" | "border_color" | "border_style" | "wiki_page_id" | "target_map_id">>,
): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  // Même ménage que pour l'image d'une carte : une bannière remplacée n'est
  // plus lue par personne.
  const remplaceBanniere = patch.banner_url !== undefined;
  const { data: avant } = remplaceBanniere
    ? await supabase.from("world_map_pins").select("banner_url").eq("id", pinId).maybeSingle()
    : { data: null };

  const { error } = await supabase
    .from("world_map_pins")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", pinId);

  if (error) throw new Error(error.message);

  const ancienne = (avant as { banner_url: string | null } | null)?.banner_url;
  if (ancienne && ancienne !== patch.banner_url) {
    await removeStoredFiles(supabase, [ancienne]);
  }
}

export async function deleteMapPin(pinId: string): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { data: avant } = await supabase
    .from("world_map_pins")
    .select("banner_url")
    .eq("id", pinId)
    .maybeSingle();

  const { error } = await supabase
    .from("world_map_pins")
    .delete()
    .eq("id", pinId);

  if (error) throw new Error(error.message);

  await removeStoredFiles(supabase, [
    (avant as { banner_url: string | null } | null)?.banner_url ?? null,
  ]);
}
