"use server";

import { createClient } from "@/lib/supabase/server";
import { deletePersona } from "@/app/(protected)/p/actions";
import { translatePersonaError } from "@/lib/personaErrors";
import { ALL_WORLD_HOME_WIDGETS, type WorldHomeWidgetId } from "@/components/worlds/home/worldHomeWidgets";
import {
  compactHomeGridRows,
  HOME_GRID_COLS,
  HOME_GRID_GAP_PRESETS,
  MAX_HOME_BLOCK_CONTENT_LENGTH,
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
import type { WorldInventoryItem, WorldSkill, WorldCatalogCategory, WorldTimelineConfig, WorldTag } from "@/types/worlds";
import { clampDaysPerMonth } from "@/lib/worldTimeline";
import { ERR_NON_AUTHENTIFIE, ERR_VALEUR_NON_SUPPORTEE , ERR_TAG_INVALIDE, echecEnregistrement } from "@/lib/actionErrors";

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

// ── world_inventory_items ─────────────────────────────────────────────────────

export async function addWorldInventoryItem(
  worldId: string,
  data: { name: string; description?: string | null; icon?: string | null; category_id?: string | null },
) {
  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("world_inventory_items")
    .insert({ world_id: worldId, ...data })
    .select()
    .single();
  if (error) return { ok: false as const, error: echecEnregistrement("addWorldInventoryItem", error) };
  return { ok: true as const, item: item as WorldInventoryItem };
}

export async function updateWorldInventoryItem(
  id: string,
  data: Partial<{ name: string; description: string | null; icon: string | null }>,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("world_inventory_items")
    .update(data)
    .eq("id", id);
  if (error) return { ok: false as const, error: echecEnregistrement("updateWorldInventoryItem", error) };
  return { ok: true as const };
}

export async function deleteWorldInventoryItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("world_inventory_items")
    .delete()
    .eq("id", id);
  if (error) return { ok: false as const, error: echecEnregistrement("deleteWorldInventoryItem", error) };
  return { ok: true as const };
}

// ── world_skills ──────────────────────────────────────────────────────────────

export async function addWorldSkill(
  worldId: string,
  data: { name: string; description?: string | null; icon?: string | null; category_id?: string | null },
) {
  const supabase = await createClient();
  const { data: skill, error } = await supabase
    .from("world_skills")
    .insert({ world_id: worldId, ...data })
    .select()
    .single();
  if (error) return { ok: false as const, error: echecEnregistrement("addWorldSkill", error) };
  return { ok: true as const, skill: skill as WorldSkill };
}

export async function updateWorldSkill(
  id: string,
  data: Partial<{ name: string; description: string | null; icon: string | null }>,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("world_skills")
    .update(data)
    .eq("id", id);
  if (error) return { ok: false as const, error: echecEnregistrement("updateWorldSkill", error) };
  return { ok: true as const };
}

export async function deleteWorldSkill(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("world_skills")
    .delete()
    .eq("id", id);
  if (error) return { ok: false as const, error: echecEnregistrement("deleteWorldSkill", error) };
  return { ok: true as const };
}

// ── world_catalog_categories ──────────────────────────────────────────────────

export async function addWorldCatalogCategory(
  worldId: string,
  type: "inventory" | "skills",
  name: string,
  options?: { column_index?: number; sort_index?: number },
) {
  const supabase = await createClient();
  const { data: category, error } = await supabase
    .from("world_catalog_categories")
    .insert({
      world_id: worldId,
      type,
      name,
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
  const supabase = await createClient();
  const { error } = await supabase
    .from("world_catalog_categories")
    .update(data)
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

// Ces deux actions renvoyaient `{ ok: true }` sans jamais regarder le résultat
// des écritures. L'appelant réordonne de façon optimiste : un refus RLS ou une
// panne réseau laissait donc l'utilisateur devant un ordre qui semblait
// enregistré et disparaissait au rechargement suivant. Les autres actions du
// fichier, elles, remontent bien leur erreur.
export async function batchUpdateCatalogCategoryOrder(
  categories: { id: string; sort_index: number; column_index: number }[],
) {
  const supabase = await createClient();
  const results = await Promise.all(
    categories.map(({ id, sort_index, column_index }) =>
      supabase.from("world_catalog_categories").update({ sort_index, column_index }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false as const, error: echecEnregistrement("batchUpdateCatalogCategoryOrder", failed.error) };
  return { ok: true as const };
}

export async function batchUpdateCatalogItemOrder(
  items: { id: string; sort_index: number; category_id: string | null }[],
  tableType: "inventory" | "skills",
) {
  const supabase = await createClient();
  const table = tableType === "inventory" ? "world_inventory_items" : "world_skills";
  const results = await Promise.all(
    items.map(({ id, sort_index, category_id }) =>
      supabase.from(table).update({ sort_index, category_id }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false as const, error: echecEnregistrement("batchUpdateCatalogItemOrder", failed.error) };
  return { ok: true as const };
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
    const card = r.card !== false;
    return { id, type, x, y, w, html, card, ...h, ...title };
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
