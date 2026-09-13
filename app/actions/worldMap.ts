"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { ERR_NON_AUTHENTIFIE } from "@/lib/actionErrors";
import {
  hexColorSchema,
  httpUrlSchema,
  idSchema,
  longTextSchema,
  lucideIconSchema,
  parseInputOrThrow,
  shortTextSchema,
} from "@/lib/inputSchemas";
import { storagePathFromUrl } from "@/lib/storage";
import type { WorldTimelineDate } from "@/types/worlds";
import type { PinRoom, WikiPageOption } from "@/components/worlds/map/types";

/** Espace de stockage des images de carte et des bannières de lieu. */
const WORLDS_BUCKET = "worlds";

// Les colonnes demandées, nommées plutôt qu'un `*`.
//
// Un `*` fait voyager ce que le client n'utilise pas, et fait surtout arriver
// sans prévenir ce qu'une migration ajoutera demain — dans une réponse dont
// les types, eux, ne bougeront pas. Nommer les colonnes, c'est dire ce que
// l'écran sait afficher.
const COLONNES_CARTE = "id, world_id, image_url, label, sort_index, scale_width_units, scale_unit";
// D'un seul tenant, sans concaténation : Supabase déduit le type de la
// réponse de la CHAÎNE LITTÉRALE passée à `select`. Coupée en deux, elle perd
// son type littéral, et la réponse revient en `GenericStringError`.
const COLONNES_EPINGLE = "id, world_id, map_id, x, y, title, description, banner_url, color, icon, icon_color, border_color, border_style, sort_index, wiki_page_id, target_map_id, exists_from, exists_until";
const COLONNES_REGION =
  "id, world_id, map_id, label, description, color, points, wiki_page_id, sort_index";
const COLONNES_LIEN = "id, map_id, from_pin_id, to_pin_id, label";

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
  /** Depuis quand, et jusqu'à quand, ce lieu existe — voir migration 156. */
  exists_from: WorldTimelineDate | null;
  exists_until: WorldTimelineDate | null;
};

/** Un point de la carte, en pourcentages de ses dimensions. */
export type MapPoint = { x: number; y: number };

/** Une région : un polygone nommé sur une carte — voir migration 157. */
export type MapRegion = {
  id: string;
  world_id: string;
  map_id: string;
  label: string;
  description: string | null;
  color: string;
  points: MapPoint[];
  wiki_page_id: string | null;
  sort_index: number;
};

// ── Ce que le client peut envoyer ────────────────────────────
//
// Chaque mutation ci-dessous recevait un `patch` typé, et l'écrivait tel quel.
// Un type ne tient qu'à la compilation : un appel forgé peut y glisser un
// `world_id` ou un `map_id`, ou dix mégaoctets dans un libellé. Ces schémas
// sont stricts — une clé de trop refuse tout l'appel — et bornés comme les
// contraintes de la base (migration 171).

/** Un pourcentage de la carte, avec la marge que le glisser autorise. */
const percentSchema = z.number().finite().min(-10).max(110);

const timelineDateSchema = z.strictObject({
  year: z.number().int(),
  month: z.number().int().min(1).max(64).nullable(),
  day: z.number().int().min(1).max(64).nullable(),
});

/** Une couleur d'épingle : hexadécimale, ou `transparent` (fond retiré). */
const pinColorSchema = z.union([hexColorSchema, z.literal("transparent")]);

const mapPatchSchema = z.strictObject({
  image_url: httpUrlSchema.nullable(),
  label: shortTextSchema,
  sort_index: z.number().int().min(0),
  scale_width_units: z.number().finite().positive().nullable(),
  scale_unit: z.string().trim().max(16).nullable(),
});

const pinPatchSchema = z.strictObject({
  x: percentSchema,
  y: percentSchema,
  title: shortTextSchema,
  description: longTextSchema.nullable(),
  banner_url: httpUrlSchema.nullable(),
  color: pinColorSchema,
  icon: lucideIconSchema,
  icon_color: hexColorSchema,
  border_color: hexColorSchema.nullable(),
  border_style: z.enum(["solid", "dashed", "dotted"]),
  wiki_page_id: idSchema.nullable(),
  target_map_id: idSchema.nullable(),
  exists_from: timelineDateSchema.nullable(),
  exists_until: timelineDateSchema.nullable(),
});

/** Assez pour un littoral tracé à la main, trop peu pour un abus. */
const MAX_REGION_POINTS = 500;

const regionPointsSchema = z.array(z.strictObject({ x: percentSchema, y: percentSchema })).max(MAX_REGION_POINTS);

const regionPatchSchema = z.strictObject({
  label: shortTextSchema,
  description: longTextSchema.nullable(),
  color: hexColorSchema,
  points: regionPointsSchema,
  wiki_page_id: idSchema.nullable(),
  sort_index: z.number().int().min(0),
});

const linkPatchSchema = z.strictObject({ label: z.string().trim().max(80) });

/**
 * Tout ce que la carte d'un monde a besoin de savoir, en un seul aller.
 *
 * Les épingles sont lues d'un bloc plutôt qu'une carte à la fois : passer d'un
 * onglet à l'autre est alors instantané, là où une requête par changement
 * d'onglet ferait clignoter la carte à chaque aller-retour. Elles se
 * répartissent ensuite par `map_id`.
 *
 * Les pages du wiki et les salons situés sont du voyage, alors qu'ils ne
 * servent qu'à la fiche d'un lieu : le client les demandait lui-même APRÈS
 * l'hydratation, soit deux allers-retours de plus pour un onglet que le
 * serveur avait déjà rendu. Deux listes courtes — les titres, rien d'autre —
 * qui arrivent maintenant avec le reste.
 */
export async function getWorldMaps(
  worldId: string,
): Promise<{
  maps: WorldMapData[];
  pins: MapPin[];
  regions: MapRegion[];
  links: MapPinLink[];
  personas: PlacedPersona[];
  wikiPages: WikiPageOption[];
  rooms: PinRoom[];
}> {
  const supabase = await createClient();
  const [
    { data: maps },
    { data: pins },
    { data: regions },
    { data: links },
    { data: wikiPages },
    { data: rooms },
    personas,
  ] = await Promise.all([
    supabase.from("world_maps").select(COLONNES_CARTE).eq("world_id", worldId).order("sort_index"),
    supabase.from("world_map_pins").select(COLONNES_EPINGLE).eq("world_id", worldId).order("sort_index"),
    supabase.from("world_map_regions").select(COLONNES_REGION).eq("world_id", worldId).order("sort_index"),
    supabase.from("world_map_pin_links").select(COLONNES_LIEN).eq("world_id", worldId),
    supabase
      .from("world_wiki_pages")
      .select("id, title, slug")
      .eq("world_id", worldId)
      .eq("is_folder", false)
      .is("deleted_at", null)
      .order("title"),
    supabase
      .from("chatrooms")
      .select("id, title, name, map_pin_id")
      .eq("world_id", worldId)
      .not("map_pin_id", "is", null),
    getPlacedPersonas(worldId),
  ]);
  return {
    maps: (maps as WorldMapData[]) ?? [],
    pins: (pins as MapPin[]) ?? [],
    regions: (regions as MapRegion[]) ?? [],
    links: (links as MapPinLink[]) ?? [],
    personas,
    wikiPages: (wikiPages as WikiPageOption[]) ?? [],
    rooms: (rooms as PinRoom[]) ?? [],
  };
}

/**
 * Un trait entre deux lieux : une route, une passe, un fleuve.
 *
 * Sans sens : « A rejoint B » et « B rejoint A » sont le même lien, et la
 * base l'interdit en double (index unique sur la paire ordonnée). Sa longueur
 * ne se stocke pas — elle se déduit des positions et de l'échelle, et suit
 * donc les épingles quand on les déplace.
 */
export type MapPinLink = {
  id: string;
  map_id: string;
  from_pin_id: string;
  to_pin_id: string;
  label: string;
};

/** Un persona posé sur un lieu — juste de quoi le nommer et le montrer. */
export type PlacedPersona = {
  id: string;
  /** À qui il est : seul son auteur peut le faire partir d'ici. */
  user_id: string;
  name: string;
  avatar_url: string | null;
  map_pin_id: string;
};

/**
 * Les personas posés quelque part dans ce monde, toutes cartes confondues.
 *
 * Relue EN ENTIER à chaque mouvement plutôt que corrigée ligne à ligne. La
 * version d'avant suivait chaque écho, relisait le persona déplacé pour en
 * obtenir le cadre d'avatar, et ne faisait rien quand cette relecture ne
 * rendait rien — un persona restait alors à sa place d'avant, sans que rien
 * ne le signale. Une liste entière ne peut pas se désaccorder d'elle-même,
 * et celle-ci est courte.
 *
 * Le cadre d'avatar n'en est pas : il ne se lit pas à la taille où ces
 * têtes s'affichent, et c'est lui qui imposait la relecture.
 */
export async function getPlacedPersonas(worldId: string): Promise<PlacedPersona[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("personas")
    .select("id, user_id, name, avatar_url, map_pin_id")
    .eq("world_id", worldId)
    .eq("is_template", false)
    .is("deleted_at", null)
    .not("map_pin_id", "is", null)
    .order("name");
  return (data as PlacedPersona[]) ?? [];
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

  const input = parseInputOrThrow(
    z.strictObject({ personaId: idSchema, pinId: idSchema.nullable() }),
    { personaId, pinId },
  );

  const { error } = await supabase
    .from("personas")
    .update({ map_pin_id: input.pinId })
    .eq("id", input.personaId);
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

  const input = parseInputOrThrow(
    z.strictObject({
      worldId: idSchema,
      patch: mapPatchSchema.pick({ image_url: true, label: true, sort_index: true }).partial(),
    }),
    { worldId, patch },
  );

  const { data, error } = await supabase
    .from("world_maps")
    .insert({ world_id: worldId, ...input.patch })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as WorldMapData;
}

export async function updateWorldMap(
  mapId: string,
  rawPatch: Partial<Pick<WorldMapData, "image_url" | "label" | "sort_index" | "scale_width_units" | "scale_unit">>,
): Promise<WorldMapData> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { patch } = parseInputOrThrow(
    z.strictObject({ mapId: idSchema, patch: mapPatchSchema.partial() }),
    { mapId, patch: rawPatch },
  );

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
export async function reorderWorldMaps(rawOrderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const orderedIds = parseInputOrThrow(z.array(idSchema).max(100), rawOrderedIds);

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

  const input = parseInputOrThrow(
    z.strictObject({ worldId: idSchema, mapId: idSchema, x: percentSchema, y: percentSchema, title: shortTextSchema }),
    { worldId, mapId, x, y, title },
  );

  const { data, error } = await supabase
    .from("world_map_pins")
    .insert({ world_id: worldId, map_id: mapId, x, y, title: input.title })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as MapPin;
}

export async function updateMapPin(
  pinId: string,
  rawPatch: Partial<Pick<MapPin, "x" | "y" | "title" | "description" | "banner_url" | "color" | "icon" | "icon_color" | "border_color" | "border_style" | "wiki_page_id" | "target_map_id" | "exists_from" | "exists_until">>,
): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { patch } = parseInputOrThrow(
    z.strictObject({ pinId: idSchema, patch: pinPatchSchema.partial() }),
    { pinId, patch: rawPatch },
  );

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

// ── Régions ──────────────────────────────────────────────────

export async function createMapRegion(
  worldId: string,
  mapId: string,
  region: { label: string; points: MapPoint[]; color: string },
): Promise<MapRegion> {
  const supabase = await createClient();
  await requireUser(supabase);

  const input = parseInputOrThrow(
    z.strictObject({
      worldId: idSchema,
      mapId: idSchema,
      region: regionPatchSchema.pick({ label: true, points: true, color: true }),
    }),
    { worldId, mapId, region },
  );

  const { data, error } = await supabase
    .from("world_map_regions")
    .insert({ world_id: worldId, map_id: mapId, ...input.region })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as MapRegion;
}

export async function updateMapRegion(
  regionId: string,
  rawPatch: Partial<Pick<MapRegion, "label" | "description" | "color" | "points" | "wiki_page_id" | "sort_index">>,
): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { patch } = parseInputOrThrow(
    z.strictObject({ regionId: idSchema, patch: regionPatchSchema.partial() }),
    { regionId, patch: rawPatch },
  );

  const { error } = await supabase
    .from("world_map_regions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", regionId);

  if (error) throw new Error(error.message);
}

export async function deleteMapRegion(regionId: string): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { error } = await supabase.from("world_map_regions").delete().eq("id", regionId);
  if (error) throw new Error(error.message);
}

/**
 * Joint deux lieux.
 *
 * La paire est RANGÉE avant d'être écrite : un lien n'a pas de sens, et c'est
 * ce rangement qui permet à une simple clé unique d'interdire le doublon
 * inverse (voir migration 166). La base refuse alors la paire déjà posée quel
 * que soit l'ordre des clics — erreur qu'on rend telle quelle, à charge pour
 * l'appelant de la dire.
 */
export async function createPinLink(
  worldId: string,
  mapId: string,
  fromPinId: string,
  toPinId: string,
): Promise<MapPinLink> {
  const supabase = await createClient();
  await requireUser(supabase);

  const [a, b] = fromPinId < toPinId ? [fromPinId, toPinId] : [toPinId, fromPinId];

  const { data, error } = await supabase
    .from("world_map_pin_links")
    .insert({
      world_id: worldId,
      map_id: mapId,
      from_pin_id: a,
      to_pin_id: b,
    })
    .select("id, map_id, from_pin_id, to_pin_id, label")
    .single();

  if (error) throw new Error(error.message);
  return data as MapPinLink;
}

export async function updatePinLink(linkId: string, rawPatch: { label: string }): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { patch } = parseInputOrThrow(
    z.strictObject({ linkId: idSchema, patch: linkPatchSchema }),
    { linkId, patch: rawPatch },
  );

  const { error } = await supabase.from("world_map_pin_links").update(patch).eq("id", linkId);
  if (error) throw new Error(error.message);
}

export async function deletePinLink(linkId: string): Promise<void> {
  const supabase = await createClient();
  await requireUser(supabase);

  const { error } = await supabase.from("world_map_pin_links").delete().eq("id", linkId);
  if (error) throw new Error(error.message);
}
