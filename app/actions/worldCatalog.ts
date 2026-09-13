"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { deletePersona } from "@/app/(protected)/p/actions";
import { translatePersonaError } from "@/lib/personaErrors";
import { ALL_WORLD_HOME_WIDGETS, type WorldHomeWidgetId } from "@/components/worlds/home/worldHomeWidgets";
import {
  compactHomeGridRows,
  HOME_GRID_COLS,
  HOME_GRID_GAP_PRESETS,
  MAX_HOME_BLOCK_CONTENT_LENGTH,
  MAX_HOME_BLOCK_CSS_LENGTH,
  MAX_HOME_BLOCK_TITLE_LENGTH,
  MAX_HOME_GRID_ITEMS,
  MAX_HOME_GRID_Y,
  sanitizeBannerContent,
  sanitizeBlockHeight,
  sanitizeWidgetOptions,
  toRows,
  type WorldHomeGridGap,
  type WorldHomeGridItem,
} from "@/components/worlds/home/worldHomeGrid";
import type { WorldCatalogItem, WorldCatalogCategory, WorldCatalogProperty, WorldCatalogRarity, WorldTimelineConfig, WorldTag } from "@/types/worlds";
import { clampDaysPerMonth } from "@/lib/worldTimeline";
import { ERR_NON_AUTHENTIFIE, ERR_VALEUR_NON_SUPPORTEE, ERR_TAG_INVALIDE, ERR_INTROUVABLE, ERR_NON_AUTORISE, echecEnregistrement } from "@/lib/actionErrors";
import { DB_TEXT_LIMITS } from "@/lib/textLimits";
import { httpUrlSchema, idSchema, longTextSchema, parseInput, shortTextSchema } from "@/lib/inputSchemas";
import { LUCIDE_ALL_ICONS } from "@/lib/lucideCategories";
import { storagePathFromUrl } from "@/lib/storage";
import { catalogItemImagePrefix } from "@/lib/storagePaths";
import {
  isCatalogRarity,
  sanitizeCatalogProperties,
  MAX_CATALOG_IMPORT_ITEMS,
  type CatalogExportItem,
} from "@/lib/worldCatalog";

/** Les noms d'icônes Lucide, en Set : la liste en compte près de 1 800. */
const LUCIDE_ICON_NAMES = new Set(LUCIDE_ALL_ICONS);

const MAX_WORLD_TAGS = 10;
const MAX_TAG_LENGTH = 24;

/** Sous-option à retomber quand on désactive la fonctionnalité principale. */
const RESTRICTION_LIEE: Partial<Record<WorldFeatureField, string>> = {
  enable_inventory: "restrict_inventory",
  enable_skills: "restrict_skills",
};

export type WorldFeatureField =
  | "enable_inventory"
  | "enable_skills"
  | "enable_map"
  | "enable_wiki";

export async function setWorldFeature(
  worldId: string,
  field: WorldFeatureField,
  enabled: boolean,
) {
  const supabase = await createClient();
  const updates: Record<string, boolean> = { [field]: enabled };
  // Désactiver la fonctionnalité retire aussi sa restriction, quand elle en a
  // une. La table est explicite : un `field === "enable_inventory" ? … : …`
  // aurait retombé `restrict_skills` pour la carte et le wiki, qui n'ont
  // aucune restriction.
  if (!enabled) {
    const restrictField = RESTRICTION_LIEE[field];
    if (restrictField) updates[restrictField] = false;
  }
  const { error } = await supabase.from("worlds").update(updates).eq("id", worldId);
  if (error) return { ok: false as const, error: echecEnregistrement("setWorldFeature", error) };
  return { ok: true as const };
}

export async function setWorldFaceclaims(worldId: string, enabled: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("worlds").update({ enable_faceclaims: enabled }).eq("id", worldId);
  if (error) return { ok: false as const, error: echecEnregistrement("setWorldFaceclaims", error) };
  return { ok: true as const };
}

/** Affiche/masque le bloc statistiques sous le titre de la page d'accueil —
 *  position fixe, ce n'est plus un bloc de home_grid (voir worldHomeGrid.ts). */
export async function setWorldHomeShowStats(worldId: string, enabled: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("worlds").update({ home_show_stats: enabled }).eq("id", worldId);
  if (error) return { ok: false as const, error: echecEnregistrement("setWorldHomeShowStats", error) };
  return { ok: true as const };
}

/** Règle la gouttière de la grille de la page d'accueil — partagée par le
 *  rendu public et l'éditeur, voir HOME_GRID_GAP_PRESETS. */
export async function setWorldHomeGridGap(worldId: string, gap: WorldHomeGridGap) {
  if (!(gap in HOME_GRID_GAP_PRESETS)) return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
  const supabase = await createClient();
  const { error } = await supabase.from("worlds").update({ home_grid_gap: gap }).eq("id", worldId);
  if (error) return { ok: false as const, error: echecEnregistrement("setWorldHomeGridGap", error) };
  return { ok: true as const };
}

export async function setWorldAgeRestricted(worldId: string, enabled: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("worlds").update({ is_age_restricted: enabled }).eq("id", worldId);
  if (error) return { ok: false as const, error: echecEnregistrement("setWorldAgeRestricted", error) };
  // La personne qui active le réglage est déjà membre (owner/admin) — on la
  // considère comme ayant confirmé, pour ne pas se bloquer elle-même l'accès.
  // Le réglage lui-même a déjà été enregistré (ci-dessus) : un échec de cet
  // appel n'annule pas l'activation, mais est journalisé pour ne pas rester
  // totalement invisible (l'acteur peut sinon se retrouver bloqué derrière
  // l'AgeGate juste après avoir activé la restriction).
  if (enabled) {
    const { error: confirmError } = await supabase.rpc("confirm_world_age", { p_world_id: worldId });
    if (confirmError) {
      console.error("confirm_world_age failed after enabling age restriction:", confirmError);
    }
  }
  return { ok: true as const };
}

export async function setWorldRestriction(
  worldId: string,
  field: "restrict_inventory" | "restrict_skills",
  enabled: boolean,
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("worlds")
    .update({ [field]: enabled })
    .eq("id", worldId);

  if (error) return { ok: false as const, error: echecEnregistrement("setWorldRestriction", error) };

  if (enabled) {
    const dataKey = field === "restrict_inventory" ? "inventoryItems" : "skillItems";
    const fieldType = field === "restrict_inventory" ? "inventory" : "skills";

    const { data: personas } = await supabase
      .from("personas")
      .select("id")
      .eq("world_id", worldId);

    const personaIds = (personas ?? []).map((p: { id: string }) => p.id);

    if (personaIds.length > 0) {
      const { data: sections } = await supabase
        .from("persona_sections")
        .select("id")
        .in("persona_id", personaIds);

      const sectionIds = (sections ?? []).map((s: { id: string }) => s.id);

      if (sectionIds.length > 0) {
        // Purge secondaire : la restriction du monde est déjà enregistrée.
        // Si elle échoue, des contenus d'inventaire ou de compétences
        // subsistent dans les fiches — visible, donc à ne pas taire, mais pas
        // de quoi annuler le changement de réglage lui-même.
        const { error } = await supabase
          .from("persona_section_fields")
          .update({ data: { [dataKey]: [] } })
          .in("section_id", sectionIds)
          .eq("type", fieldType);
        if (error) console.error("[setWorldRestriction] champs non purgés", error.message);
      }
    }
  }

  return { ok: true as const };
}

// ── world_catalog_items ───────────────────────────────────────────────────────
// Objets et compétences partagent une table depuis la migration 161 ; ils
// partagent donc aussi leurs actions. Ce fichier en portait deux jeux
// identiques, à `world_inventory_items` / `world_skills` près.

/** Colonnes rendues par une écriture — la forme attendue par le client. */
const CATALOG_ITEM_COLUMNS =
  "id, world_id, type, category_id, name, description, icon, lucide_icon, image_url, rarity, stackable, max_quantity, properties, sort_index";

const catalogTypeSchema = z.enum(["inventory", "skills"]);

/**
 * Ce qu'une écriture accepte de recevoir — et rien d'autre.
 *
 * Les types TypeScript ne PROTÈGENT de rien : une action serveur reçoit ce
 * qu'on lui envoie, et TypeScript s'arrête à la frontière. Le schéma est
 * strict (lib/inputSchemas.ts) : une clé inconnue — `world_id`, `sort_index`,
 * `deleted_at` — refuse l'appel au lieu d'être écrite. Toutes les clés sont
 * facultatives : une mise à jour partielle n'a pas à fournir le reste, et
 * l'ajout exige le nom à part.
 *
 * Le nom d'icône Lucide est vérifié contre la bibliothèque, et pas seulement
 * borné : il finit dans un `import()` de `lucide-react` côté client
 * (LazyLucideIcon), et rien n'est plus difficile à diagnostiquer qu'une icône
 * muette. Les propriétés libres passent par `sanitizeCatalogProperties`, qui
 * en tronque le nombre et la longueur comme le fait la contrainte de la base.
 * L'URL d'image n'a pas encore sa contrainte `is_http_url` en base (la
 * migration 171 ne connaissait pas la table) : le schéma tient ce rôle.
 */
const catalogItemSchema = z
  .strictObject({
    name: shortTextSchema,
    description: longTextSchema.nullable().transform((v) => v || null),
    icon: z.string().max(DB_TEXT_LIMITS["world_catalog_items.icon"]).nullable().transform((v) => v || null),
    lucide_icon: z
      .string()
      .max(DB_TEXT_LIMITS["world_catalog_items.lucide_icon"])
      .nullable()
      .transform((v) => v || null)
      .refine((v) => v === null || LUCIDE_ICON_NAMES.has(v)),
    image_url: z.union([httpUrlSchema, z.literal(""), z.null()]).transform((v) => v || null),
    rarity: z.custom<WorldCatalogRarity>(isCatalogRarity).nullable(),
    stackable: z.boolean(),
    max_quantity: z.number().int().min(1).nullable(),
    properties: z.custom<WorldCatalogProperty[]>(Array.isArray).transform((v) => sanitizeCatalogProperties(v)),
    category_id: idSchema.nullable(),
  })
  .partial();

export type CatalogItemInput = z.input<typeof catalogItemSchema>;

/**
 * Ramène une saisie à ce que la base accepte, ou dit pourquoi elle refuse.
 *
 * La RLS dit qui peut écrire, jamais quoi ; les contraintes de longueur de la
 * migration 161 se contentent de faire échouer l'écriture avec un message
 * illisible. La vérification est faite ici, une fois, pour l'ajout comme pour
 * la mise à jour. `category_id` en est retiré : sa validité dépend du monde
 * et du type, que seule l'action connaît.
 */
function cleanCatalogItemInput(
  data: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const input = parseInput(catalogItemSchema, data);
  if (!input.ok) return input;
  const { category_id: _category, ...value } = input.data;
  return { ok: true, value };
}

/**
 * La catégorie visée appartient-elle bien à ce monde ET à ce type ?
 *
 * La RLS laisse un éditeur écrire dans les objets de SON monde, et une
 * catégorie n'est qu'un UUID dans le corps de la requête : rien n'empêchait
 * d'y ranger un objet sous une catégorie d'un autre monde, ou sous une
 * catégorie de compétences. L'objet disparaissait alors de l'affichage —
 * `groupByColumn` ne le rattache à aucune colonne — sans que rien ne signale
 * l'erreur.
 */
async function catalogCategoryFits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string,
  worldId: string,
  type: "inventory" | "skills",
): Promise<boolean> {
  const { data } = await supabase
    .from("world_catalog_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("world_id", worldId)
    .eq("type", type)
    .maybeSingle();
  return !!data;
}

/**
 * Crée un objet ou une compétence.
 *
 * `options.id` : l'identifiant peut venir du client. Le dialogue de création
 * téléverse l'image AVANT d'enregistrer la ligne, et le dossier de stockage
 * porte l'identifiant de l'objet (migration 163) — il faut donc le connaître
 * d'avance. La base refuse un doublon ; un identifiant forgé ne peut donc
 * qu'échouer, jamais écraser.
 */
export async function addWorldCatalogItem(
  worldId: string,
  type: "inventory" | "skills",
  data: CatalogItemInput,
  options?: { id?: string },
) {
  const head = parseInput(
    z.strictObject({
      worldId: idSchema,
      type: catalogTypeSchema,
      options: z.strictObject({ id: z.uuid() }).partial().optional(),
    }),
    { worldId, type, options },
  );
  if (!head.ok) return { ok: false as const, error: head.error };
  const cleaned = cleanCatalogItemInput(data);
  if (!cleaned.ok) return { ok: false as const, error: cleaned.error };
  if (cleaned.value.name === undefined) return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };

  const supabase = await createClient();

  const categoryId = data.category_id ?? null;
  if (categoryId && !(await catalogCategoryFits(supabase, categoryId, worldId, type))) {
    return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
  }

  const { data: item, error } = await supabase
    .from("world_catalog_items")
    .insert({
      ...(head.data.options?.id ? { id: head.data.options.id } : {}),
      world_id: worldId,
      type,
      category_id: categoryId,
      ...cleaned.value,
    })
    .select(CATALOG_ITEM_COLUMNS)
    .single();
  if (error) return { ok: false as const, error: echecEnregistrement("addWorldCatalogItem", error) };
  return { ok: true as const, item: item as unknown as WorldCatalogItem };
}

export async function updateWorldCatalogItem(id: string, data: CatalogItemInput) {
  const head = parseInput(idSchema, id);
  if (!head.ok) return { ok: false as const, error: head.error };
  const cleaned = cleanCatalogItemInput(data);
  if (!cleaned.ok) return { ok: false as const, error: cleaned.error };

  const supabase = await createClient();

  const patch: Record<string, unknown> = { ...cleaned.value };

  // Changer de catégorie demande de savoir à quel monde et à quel type
  // appartient l'objet — la requête n'en dit rien, seule la ligne le sait.
  if (data.category_id !== undefined) {
    if (data.category_id === null) {
      patch.category_id = null;
    } else {
      const { data: existing } = await supabase
        .from("world_catalog_items")
        .select("world_id, type")
        .eq("id", id)
        .maybeSingle();
      if (!existing) return { ok: false as const, error: ERR_INTROUVABLE };
      const row = existing as { world_id: string; type: "inventory" | "skills" };
      if (!(await catalogCategoryFits(supabase, data.category_id, row.world_id, row.type))) {
        return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
      }
      patch.category_id = data.category_id;
    }
  }

  if (Object.keys(patch).length === 0) return { ok: true as const };

  const { error } = await supabase.from("world_catalog_items").update(patch).eq("id", id);
  if (error) return { ok: false as const, error: echecEnregistrement("updateWorldCatalogItem", error) };
  return { ok: true as const };
}

// ── Corbeille ─────────────────────────────────────────────────────────────────
// Supprimer un objet emportait avec lui le sens de toutes les entrées de fiche
// qui le désignaient. Il est désormais marqué, pas retiré (migration 165) : le
// restaurer rend son objet à toutes les fiches d'un coup, sans qu'aucune ait à
// être retouchée — elles n'ont jamais cessé de le désigner.

export async function trashWorldCatalogItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("world_catalog_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false as const, error: echecEnregistrement("trashWorldCatalogItem", error) };
  return { ok: true as const };
}

export async function restoreWorldCatalogItem(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("world_catalog_items")
    .update({ deleted_at: null })
    .eq("id", id)
    .select(CATALOG_ITEM_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false as const, error: echecEnregistrement("restoreWorldCatalogItem", error) };
  if (!data) return { ok: false as const, error: ERR_INTROUVABLE };
  return { ok: true as const, item: data as unknown as WorldCatalogItem };
}

/** Les objets en corbeille, du plus récemment supprimé au plus ancien. */
export async function listTrashedWorldCatalogItems(worldId: string, type: "inventory" | "skills") {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("world_catalog_items")
    .select(`${CATALOG_ITEM_COLUMNS}, deleted_at`)
    .eq("world_id", worldId)
    .eq("type", type)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) return { ok: false as const, error: echecEnregistrement("listTrashedWorldCatalogItems", error) };
  return { ok: true as const, items: (data ?? []) as unknown as WorldCatalogItem[] };
}

/**
 * Supprime un objet pour de bon, son image avec lui.
 *
 * Le ménage du stockage passe par une LISTE du dossier, et non par l'URL
 * rangée dans la ligne. Une image téléversée puis abandonnée — le dialogue de
 * modification fermé sans enregistrer — n'est référencée nulle part et
 * resterait sinon à demeure. Elle bloquerait au passage la purge automatique
 * de la migration 165, qui refuse d'effacer une ligne dont le dossier n'est
 * pas vide.
 *
 * L'échec du ménage n'annule pas la suppression : un fichier orphelin ne casse
 * rien, une ligne à moitié supprimée si.
 */
export async function purgeWorldCatalogItem(id: string) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("world_catalog_items")
    .select("id, world_id, image_url")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false as const, error: ERR_INTROUVABLE };
  const row = existing as { id: string; world_id: string; image_url: string | null };

  const prefix = catalogItemImagePrefix(row.world_id, row.id);
  const { data: files } = await supabase.storage.from("worlds").list(prefix);
  const paths = (files ?? []).map((f) => `${prefix}/${f.name}`);
  // Ceinture et bretelles : si la liste échoue, l'URL de la ligne donne au
  // moins le fichier courant.
  const fromUrl = storagePathFromUrl(row.image_url, "worlds");
  if (fromUrl && !paths.includes(fromUrl)) paths.push(fromUrl);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from("worlds").remove(paths);
    if (removeError) console.error("[purgeWorldCatalogItem] image non effacée", removeError.message);
  }

  const { error } = await supabase.from("world_catalog_items").delete().eq("id", id);
  if (error) return { ok: false as const, error: echecEnregistrement("purgeWorldCatalogItem", error) };
  return { ok: true as const };
}

/**
 * Recopie un objet, dans sa catégorie, juste après lui.
 *
 * Deux objets d'un même monde se ressemblent souvent à un détail près — une
 * épée courte et une épée longue, un sort et sa version majeure. Les saisir
 * l'un après l'autre revenait à retaper description, rareté et propriétés.
 *
 * L'image, elle, n'est PAS recopiée : les deux lignes pointeraient le même
 * fichier, et supprimer l'une emporterait l'image de l'autre au ménage.
 */
export async function duplicateWorldCatalogItem(id: string) {
  const supabase = await createClient();
  const { data: source, error: readError } = await supabase
    .from("world_catalog_items")
    .select(CATALOG_ITEM_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (readError) return { ok: false as const, error: echecEnregistrement("duplicateWorldCatalogItem", readError) };
  if (!source) return { ok: false as const, error: ERR_INTROUVABLE };

  const item = source as unknown as WorldCatalogItem;
  const { data: copy, error } = await supabase
    .from("world_catalog_items")
    .insert({
      world_id: item.world_id,
      type: item.type,
      category_id: item.category_id ?? null,
      name: item.name.slice(0, DB_TEXT_LIMITS["world_catalog_items.name"] - 2) + " 2",
      description: item.description ?? null,
      icon: item.icon ?? null,
      lucide_icon: item.lucide_icon ?? null,
      rarity: item.rarity ?? null,
      stackable: item.stackable !== false,
      max_quantity: item.max_quantity ?? null,
      properties: item.properties ?? [],
      sort_index: item.sort_index + 1,
    })
    .select(CATALOG_ITEM_COLUMNS)
    .single();
  if (error) return { ok: false as const, error: echecEnregistrement("duplicateWorldCatalogItem", error) };
  return { ok: true as const, item: copy as unknown as WorldCatalogItem };
}

// ── world_catalog_categories ──────────────────────────────────────────────────

const catalogCategorySchema = z.strictObject({
  worldId: idSchema,
  type: catalogTypeSchema,
  name: shortTextSchema,
  options: z
    .strictObject({ column_index: z.number().int().min(0), sort_index: z.number().int().min(0) })
    .partial()
    .optional(),
});

export async function addWorldCatalogCategory(
  worldId: string,
  type: "inventory" | "skills",
  name: string,
  options?: { column_index?: number; sort_index?: number },
) {
  const input = parseInput(catalogCategorySchema, { worldId, type, name, options });
  if (!input.ok) return { ok: false as const, error: input.error };

  const supabase = await createClient();
  const { data: category, error } = await supabase
    .from("world_catalog_categories")
    .insert({
      world_id: worldId,
      type,
      name: input.data.name,
      column_index: options?.column_index ?? 0,
      sort_index: options?.sort_index ?? 0,
    })
    .select()
    .single();
  if (error) return { ok: false as const, error: echecEnregistrement("addWorldCatalogCategory", error) };
  return { ok: true as const, category: category as WorldCatalogCategory };
}

export async function updateWorldCatalogCategory(
  id: string,
  data: Partial<{ name: string; sort_index: number }>,
) {
  const input = parseInput(
    z.strictObject({
      id: idSchema,
      data: z.strictObject({ name: shortTextSchema, sort_index: z.number().int().min(0) }).partial(),
    }),
    { id, data },
  );
  if (!input.ok) return { ok: false as const, error: input.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("world_catalog_categories")
    .update(input.data.data)
    .eq("id", id);
  if (error) return { ok: false as const, error: echecEnregistrement("updateWorldCatalogCategory", error) };
  return { ok: true as const };
}

export async function deleteWorldCatalogCategory(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("world_catalog_categories")
    .delete()
    .eq("id", id);
  if (error) return { ok: false as const, error: echecEnregistrement("deleteWorldCatalogCategory", error) };
  return { ok: true as const };
}

// ── Réordonnancement ──────────────────────────────────────────────────────────
// Ces deux actions envoyaient un `UPDATE` par ligne, en parallèle, et
// renvoyaient `{ ok: true }` sans regarder le résultat : un refus RLS ou une
// coupure réseau laissait l'utilisateur devant un ordre qui semblait
// enregistré et disparaissait au rechargement suivant.
//
// Les RPC de la migration 162 font le tout en une requête et rendent le nombre
// de lignes touchées. Une RLS qui refuse ne lève pas d'erreur — elle ne met
// rien à jour, en silence : c'est cet écart de compte qui la trahit.

const MAX_REORDER_ROWS = 500;

export async function reorderWorldCatalogItems(
  items: { id: string; sort_index: number; category_id: string | null }[],
) {
  const input = parseInput(
    z
      .array(z.strictObject({ id: idSchema, sort_index: z.number().int().min(0), category_id: idSchema.nullable() }))
      .max(MAX_REORDER_ROWS),
    items,
  );
  if (!input.ok) return { ok: false as const, error: input.error };
  if (items.length === 0) return { ok: true as const };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reorder_world_catalog_items", { p_items: items });
  if (error) return { ok: false as const, error: echecEnregistrement("reorderWorldCatalogItems", error) };
  if ((data as number | null) !== items.length) {
    return { ok: false as const, error: ERR_NON_AUTORISE };
  }
  return { ok: true as const };
}

export async function reorderWorldCatalogCategories(
  categories: { id: string; sort_index: number; column_index: number }[],
) {
  const input = parseInput(
    z
      .array(z.strictObject({ id: idSchema, sort_index: z.number().int().min(0), column_index: z.number().int().min(0) }))
      .max(MAX_REORDER_ROWS),
    categories,
  );
  if (!input.ok) return { ok: false as const, error: input.error };
  if (categories.length === 0) return { ok: true as const };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reorder_world_catalog_categories", {
    p_categories: categories,
  });
  if (error) return { ok: false as const, error: echecEnregistrement("reorderWorldCatalogCategories", error) };
  if ((data as number | null) !== categories.length) {
    return { ok: false as const, error: ERR_NON_AUTORISE };
  }
  return { ok: true as const };
}

// ── Décompte d'usage ──────────────────────────────────────────────────────────

/**
 * Combien de personas portent chaque objet du catalogue.
 *
 * Sert à répondre avant une suppression : « celui-là, quelqu'un l'a ». Le
 * détail — qui, dans quelle fiche — ne franchit pas la RPC, qui n'agrège que
 * des nombres (voir la migration 162).
 */
export async function getWorldCatalogUsage(worldId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("world_catalog_usage", { p_world_id: worldId });
  if (error) return { ok: false as const, error: echecEnregistrement("getWorldCatalogUsage", error) };
  const rows = (data ?? []) as { catalog_id: string; persona_count: number }[];
  return { ok: true as const, usage: Object.fromEntries(rows.map((r) => [r.catalog_id, r.persona_count])) };
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Verse un catalogue exporté dans un monde.
 *
 * L'export désigne les catégories par leur NOM : un identifiant de catégorie
 * ne veut rien dire dans un autre monde. À l'import, un nom déjà présent est
 * réutilisé, un nom inconnu crée sa catégorie — sans quoi tout arriverait en
 * vrac dans « Sans catégorie ».
 *
 * Rien n'est remplacé : l'import AJOUTE. Écraser le catalogue existant serait
 * irrattrapable, et fusionner sur le nom confondrait deux objets homonymes que
 * le monde distingue peut-être.
 */
export async function importWorldCatalogItems(
  worldId: string,
  type: "inventory" | "skills",
  items: CatalogExportItem[],
) {
  const head = parseInput(
    z.strictObject({ worldId: idSchema, type: catalogTypeSchema, items: z.array(z.unknown()) }),
    { worldId, type, items },
  );
  if (!head.ok) return { ok: false as const, error: head.error };
  const accepted = items.slice(0, MAX_CATALOG_IMPORT_ITEMS);
  if (accepted.length === 0) return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };

  const supabase = await createClient();

  const { data: existing, error: catError } = await supabase
    .from("world_catalog_categories")
    .select("id, name")
    .eq("world_id", worldId)
    .eq("type", type);
  if (catError) return { ok: false as const, error: echecEnregistrement("importWorldCatalogItems", catError) };

  // Comparaison sur le nom réduit — « Armes » et « armes » sont la même
  // catégorie pour qui lit la page, et en créer deux serait déroutant.
  const idByName = new Map<string, string>();
  for (const row of (existing ?? []) as { id: string; name: string }[]) {
    idByName.set(row.name.trim().toLowerCase(), row.id);
  }

  const missing = [...new Set(
    accepted
      .map((item) => item.category?.trim())
      .filter((name): name is string => !!name && !idByName.has(name.toLowerCase())),
  )];

  if (missing.length > 0) {
    const { data: created, error: createError } = await supabase
      .from("world_catalog_categories")
      .insert(missing.map((name, index) => ({
        world_id: worldId,
        type,
        name,
        column_index: 0,
        sort_index: (existing?.length ?? 0) + index,
      })))
      .select("id, name");
    if (createError) return { ok: false as const, error: echecEnregistrement("importWorldCatalogItems", createError) };
    for (const row of (created ?? []) as { id: string; name: string }[]) {
      idByName.set(row.name.trim().toLowerCase(), row.id);
    }
  }

  const rows = accepted.map((item, index) => {
    const cleaned = cleanCatalogItemInput({
      name: item.name,
      description: item.description ?? null,
      icon: item.icon ?? null,
      lucide_icon: item.lucide_icon ?? null,
      rarity: item.rarity ?? null,
      stackable: item.stackable !== false,
      max_quantity: item.max_quantity ?? null,
      properties: item.properties ?? [],
    });
    if (!cleaned.ok) return null;
    const categoryName = item.category?.trim().toLowerCase();
    return {
      world_id: worldId,
      type,
      category_id: (categoryName && idByName.get(categoryName)) || null,
      sort_index: index,
      ...cleaned.value,
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };

  const { data: inserted, error } = await supabase
    .from("world_catalog_items")
    .insert(rows)
    .select(CATALOG_ITEM_COLUMNS);
  if (error) return { ok: false as const, error: echecEnregistrement("importWorldCatalogItems", error) };
  return { ok: true as const, items: (inserted ?? []) as unknown as WorldCatalogItem[] };
}

// ── Fiche de persona par défaut ───────────────────────────────────────────────
// La fiche par défaut d'un monde est un persona modèle (is_template = true,
// un seul par monde, possédé par le propriétaire du monde). Sa structure est
// copiée sur chaque persona créé dans le monde (voir createPersona).

export async function getWorldPersonaTemplate(worldId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personas")
    .select("id")
    .eq("world_id", worldId)
    .eq("is_template", true)
    .maybeSingle();
  if (error) return { ok: false as const, error: echecEnregistrement("getWorldPersonaTemplate", error) };
  return { ok: true as const, templateId: (data?.id as string | undefined) ?? null };
}

export async function setWorldPersonaTemplate(worldId: string, enabled: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: ERR_NON_AUTHENTIFIE };

  const { data: existing } = await supabase
    .from("personas")
    .select("id")
    .eq("world_id", worldId)
    .eq("is_template", true)
    .maybeSingle();

  if (enabled) {
    if (existing) return { ok: true as const, templateId: existing.id as string };
    const { data, error } = await supabase
      .from("personas")
      .insert({
        user_id: user.id,
        name: "Fiche par défaut",
        world_id: worldId,
        is_template: true,
      })
      .select("id")
      .single();
    if (error) return { ok: false as const, error: translatePersonaError(error) };
    return { ok: true as const, templateId: data.id as string };
  }

  if (existing) {
    // deletePersona nettoie aussi les fichiers storage (images de grilles…)
    const res = await deletePersona(existing.id as string);
    if (!res.ok) return { ok: false as const, error: res.error ?? "Suppression impossible." };
  }
  return { ok: true as const, templateId: null };
}

// ── Communauté : tags & type d'avatars ────────────────────────────────────────

const WORLD_AVATAR_TYPE_FIELDS = new Set(["allows_real_avatars", "allows_illustrated_avatars"]);

export async function setWorldAvatarType(
  worldId: string,
  field: "allows_real_avatars" | "allows_illustrated_avatars",
  enabled: boolean,
) {
  if (!WORLD_AVATAR_TYPE_FIELDS.has(field)) return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
  const supabase = await createClient();
  const { error } = await supabase.from("worlds").update({ [field]: enabled }).eq("id", worldId);
  if (error) return { ok: false as const, error: echecEnregistrement("setWorldAvatarType", error) };
  return { ok: true as const };
}

export async function getWorldTags(worldId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("world_tags")
    .select("id, world_id, tag, created_at")
    .eq("world_id", worldId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false as const, error: echecEnregistrement("getWorldTags", error) };
  return { ok: true as const, tags: (data ?? []) as WorldTag[] };
}

// Lettres (accents inclus) et chiffres uniquement — ni espaces, ni apostrophes,
// ni ponctuation ou autres symboles (la virgule casserait aussi le filtrage
// par `tags` dans l'URL de /explore, voir exploreQuery.ts).
const TAG_FORMAT = /^[\p{L}\p{N}]+$/u;

export async function addWorldTag(worldId: string, rawTag: string) {
  // Un `null` à la place de la chaîne faisait tomber `.trim()` en TypeError,
  // soit une erreur 500 opaque là où un refus propre suffit.
  const input = parseInput(z.strictObject({ worldId: idSchema, rawTag: z.string().max(1000) }), { worldId, rawTag });
  if (!input.ok) return { ok: false as const, error: ERR_TAG_INVALIDE };
  const tag = rawTag.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
  if (!tag) return { ok: false as const, error: ERR_TAG_INVALIDE };
  if (!TAG_FORMAT.test(tag)) {
    return { ok: false as const, error: ERR_TAG_INVALIDE };
  }

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("world_tags")
    .select("id", { count: "exact", head: true })
    .eq("world_id", worldId);
  if (countError) return { ok: false as const, error: echecEnregistrement("addWorldTag", countError) };
  if ((count ?? 0) >= MAX_WORLD_TAGS) {
    return { ok: false as const, error: `Maximum ${MAX_WORLD_TAGS} tags par monde.` };
  }

  const { error } = await supabase
    .from("world_tags")
    .insert({ world_id: worldId, tag })
    .select()
    .single();
  if (error) {
    // Déjà présent pour ce monde : idempotent plutôt qu'une erreur — l'appelant
    // récupère simplement le tag existant.
    if (error.code === "23505") return { ok: true as const, tag };
    if (error.code === "23514") return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
    return { ok: false as const, error: echecEnregistrement("addWorldTag", error) };
  }
  return { ok: true as const, tag };
}

export async function removeWorldTag(worldId: string, tag: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("world_tags")
    .delete()
    .eq("world_id", worldId)
    .eq("tag", tag);
  if (error) return { ok: false as const, error: echecEnregistrement("removeWorldTag", error) };
  return { ok: true as const };
}

export async function setWorldTimeline(
  worldId: string,
  enabled: boolean,
  config?: WorldTimelineConfig | null,
) {
  const supabase = await createClient();
  const updates: Record<string, unknown> = { timeline_enabled: enabled };
  // `days_per_month` borné même côté serveur : le client clampe déjà à la
  // saisie, mais rien ne garantit qu'une valeur aberrante ne l'atteigne pas
  // par un autre chemin — cette longueur alimente ensuite un `Array.from`
  // dans le widget de calendrier (voir clampDaysPerMonth).
  if (config !== undefined) {
    updates.timeline_config = config && config.days_per_month
      ? { ...config, days_per_month: config.days_per_month.map(clampDaysPerMonth) }
      : config;
  }
  const { error } = await supabase.from("worlds").update(updates).eq("id", worldId);
  if (error) return { ok: false as const, error: echecEnregistrement("setWorldTimeline", error) };
  return { ok: true as const };
}

// ── Grille de blocs de la page d'accueil ──────────────────────────────────

const HOME_GRID_BLOCK_TYPES = new Set(["widget", "html", "markdown", "banner"]);

function isFiniteInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function isWorldHomeWidgetId(value: unknown): value is WorldHomeWidgetId {
  return typeof value === "string" && (ALL_WORLD_HOME_WIDGETS as string[]).includes(value);
}

/** Longueur maximale d'un id de bloc (uuid = 36). */
const MAX_BLOCK_ID_LENGTH = 64;

/**
 * Valide un item envoyé par le client et retourne sa forme normalisée, ou
 * `null` s'il est invalide — rejeté plutôt qu'ignoré silencieusement (une
 * incohérence type/champs ou une coordonnée hors bornes peut indiquer une
 * donnée corrompue ou un contournement de l'UI, pas juste un cas à filtrer).
 *
 * L'id fourni par le client est conservé (après validation : chaîne non vide,
 * bornée, unique dans la grille). Le régénérer à chaque enregistrement
 * changerait l'identité de tous les blocs à chaque sauvegarde — donc leur clé
 * React et leur identité côté react-grid-layout — ce qui les démonte/remonte
 * et casse un geste de redimensionnement encore en cours. `seenIds` garantit
 * l'unicité, ce qui suffit à écarter collision et écrasement.
 */
function validateHomeGridItem(
  raw: unknown,
  seenIds: Set<string>,
  seenWidgetIds: Set<WorldHomeWidgetId>,
): WorldHomeGridItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (!HOME_GRID_BLOCK_TYPES.has(r.type as string)) return null;
  const type = r.type as "widget" | "html" | "markdown" | "banner";

  // Seuls x, y et w sont des unités de grille. La hauteur (`h`), réservée
  // aux blocs à contenu libre, est en pixels et traitée plus bas — les autres
  // blocs occupent une ligne qui s'auto-dimensionne (voir worldHomeGrid.ts).
  if (!isFiniteInt(r.x) || !isFiniteInt(r.y) || !isFiniteInt(r.w)) return null;
  const { x, y, w } = r as { x: number; y: number; w: number };
  if (x < 0 || y < 0 || y > MAX_HOME_GRID_Y || w < 2 || x + w > HOME_GRID_COLS) return null;

  if (typeof r.id !== "string" || !r.id || r.id.length > MAX_BLOCK_ID_LENGTH || seenIds.has(r.id)) return null;
  const id = r.id;
  seenIds.add(id);

  if (type === "widget") {
    if (!isWorldHomeWidgetId(r.widgetId) || r.widgetId === "announcement") return null;
    if (seenWidgetIds.has(r.widgetId)) return null;
    if (r.html !== undefined || r.content !== undefined) return null;
    seenWidgetIds.add(r.widgetId);
    // Réglages bornés au registre : une clé inconnue ou une valeur hors
    // bornes est écartée plutôt qu'enregistrée telle quelle.
    const options = sanitizeWidgetOptions(r.widgetId, r.options);
    return { id, type, x, y, w, widgetId: r.widgetId, ...(options ? { options } : {}) };
  }

  if (type === "banner") {
    if (r.widgetId !== undefined || r.html !== undefined || r.content !== undefined) return null;
    const banner = sanitizeBannerContent(r.banner);
    if (!banner) return null;
    return { id, type, x, y, w, banner };
  }

  // Titre libre optionnel (html/markdown) — tronqué plutôt que rejeté : il
  // est purement descriptif, pas la peine d'invalider tout le bloc.
  const title =
    typeof r.title === "string" && r.title.trim()
      ? { title: r.title.trim().slice(0, MAX_HOME_BLOCK_TITLE_LENGTH) }
      : {};

  // Hauteur explicite optionnelle (html/markdown uniquement) : bornée plutôt
  // que rejetée, comme les réglages de widget. Une valeur inexploitable
  // retombe sur « automatique » au lieu d'invalider tout l'enregistrement —
  // même tolérance que pour un `h` reçu sur un widget (voir plus haut).
  const height = sanitizeBlockHeight(r.h);
  const h = height ? { h: height } : {};

  if (type === "html") {
    if (typeof r.html !== "string" || r.widgetId !== undefined || r.content !== undefined) return null;
    const html = r.html.trim();
    if (html.length > MAX_HOME_BLOCK_CONTENT_LENGTH) return null;
    // Feuille de style du bloc — optionnelle, et bornée comme son balisage.
    // Elle n'est PAS assainie ici : le CSS n'exécute rien, et son cloisonnement
    // (`@scope`) comme la neutralisation de `</` se font au rendu, seul
    // endroit qui protège aussi le contenu déjà en base.
    if (r.css !== undefined && typeof r.css !== "string") return null;
    const rawCss = typeof r.css === "string" ? r.css.trim() : "";
    if (rawCss.length > MAX_HOME_BLOCK_CSS_LENGTH) return null;
    const css = rawCss ? { css: rawCss } : {};
    const card = r.card !== false;
    return { id, type, x, y, w, html, card, ...css, ...h, ...title };
  }

  // markdown
  if (typeof r.content !== "string" || r.widgetId !== undefined || r.html !== undefined) return null;
  const content = r.content.trim();
  if (content.length > MAX_HOME_BLOCK_CONTENT_LENGTH) return null;
  const card = r.card === true;
  return { id, type, x, y, w, content, card, ...h, ...title };
}

export async function setWorldHomeGrid(worldId: string, items: unknown[]) {
  if (!Array.isArray(items)) return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
  if (items.length > MAX_HOME_GRID_ITEMS) {
    return { ok: false as const, error: `Maximum ${MAX_HOME_GRID_ITEMS} blocs.` };
  }

  const seenIds = new Set<string>();
  const seenWidgetIds = new Set<WorldHomeWidgetId>();
  const parsed: WorldHomeGridItem[] = [];
  for (const raw of items) {
    const item = validateHomeGridItem(raw, seenIds, seenWidgetIds);
    if (!item) return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
    parsed.push(item);
  }
  // Chaque bloc est valide pris isolément (bornes, largeur…), mais rien
  // n'empêche encore deux blocs valides de se chevaucher sur une même ligne
  // (ex: x=0,w=8 et x=6,w=6) — l'éditeur ne peut pas produire ce cas via
  // moveBlock/resizeBlock, mais le serveur ne doit pas faire confiance à la
  // seule discipline du client. `toRows` trie déjà chaque ligne par `x`, il
  // suffit de vérifier qu'aucun bloc ne commence avant la fin du précédent.
  for (const row of toRows(parsed)) {
    for (let i = 1; i < row.length; i++) {
      if (row[i].x < row[i - 1].x + row[i - 1].w) {
        return { ok: false as const, error: ERR_VALEUR_NON_SUPPORTEE };
      }
    }
  }
  // Renumérote les lignes : retirer un bloc laisse sinon sa ligne vide, et le
  // rendu afficherait un trou à sa place (voir compactHomeGridRows).
  const validated = compactHomeGridRows(parsed);

  const supabase = await createClient();
  const { error } = await supabase.from("worlds").update({ home_grid: validated }).eq("id", worldId);
  if (error) return { ok: false as const, error: echecEnregistrement("setWorldHomeGrid", error) };
  return { ok: true as const, items: validated };
}
