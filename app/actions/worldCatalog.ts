"use server";

import { createClient } from "@/lib/supabase/server";
import { deletePersona } from "@/app/(protected)/p/actions";
import { translatePersonaError } from "@/lib/personaErrors";
import type { WorldInventoryItem, WorldSkill, WorldCatalogCategory, WorldTimelineConfig, WorldTag } from "@/types/worlds";

const MAX_WORLD_TAGS = 10;
const MAX_TAG_LENGTH = 24;

export async function setWorldFeature(
  worldId: string,
  field: "enable_inventory" | "enable_skills",
  enabled: boolean,
) {
  const supabase = await createClient();
  const updates: Record<string, boolean> = { [field]: enabled };
  // Désactiver la fonctionnalité retire aussi la restriction (sous-option)
  if (!enabled) {
    const restrictField = field === "enable_inventory" ? "restrict_inventory" : "restrict_skills";
    updates[restrictField] = false;
  }
  const { error } = await supabase.from("worlds").update(updates).eq("id", worldId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function setWorldFaceclaims(worldId: string, enabled: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("worlds").update({ enable_faceclaims: enabled }).eq("id", worldId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function setWorldAgeRestricted(worldId: string, enabled: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("worlds").update({ is_age_restricted: enabled }).eq("id", worldId);
  if (error) return { ok: false as const, error: error.message };
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

  if (error) return { ok: false as const, error: error.message };

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
        await supabase
          .from("persona_section_fields")
          .update({ data: { [dataKey]: [] } })
          .in("section_id", sectionIds)
          .eq("type", fieldType);
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
  if (error) return { ok: false as const, error: error.message };
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
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deleteWorldInventoryItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("world_inventory_items")
    .delete()
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
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
  if (error) return { ok: false as const, error: error.message };
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
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deleteWorldSkill(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("world_skills")
    .delete()
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
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
  if (error) return { ok: false as const, error: error.message };
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
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deleteWorldCatalogCategory(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("world_catalog_categories")
    .delete()
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function batchUpdateCatalogCategoryOrder(
  categories: { id: string; sort_index: number; column_index: number }[],
) {
  const supabase = await createClient();
  await Promise.all(
    categories.map(({ id, sort_index, column_index }) =>
      supabase.from("world_catalog_categories").update({ sort_index, column_index }).eq("id", id),
    ),
  );
  return { ok: true as const };
}

export async function batchUpdateCatalogItemOrder(
  items: { id: string; sort_index: number; category_id: string | null }[],
  tableType: "inventory" | "skills",
) {
  const supabase = await createClient();
  const table = tableType === "inventory" ? "world_inventory_items" : "world_skills";
  await Promise.all(
    items.map(({ id, sort_index, category_id }) =>
      supabase.from(table).update({ sort_index, category_id }).eq("id", id),
    ),
  );
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
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, templateId: (data?.id as string | undefined) ?? null };
}

export async function setWorldPersonaTemplate(worldId: string, enabled: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Vous devez être connecté." };

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
  if (!WORLD_AVATAR_TYPE_FIELDS.has(field)) return { ok: false as const, error: "Champ invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("worlds").update({ [field]: enabled }).eq("id", worldId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function getWorldTags(worldId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("world_tags")
    .select("id, world_id, tag, created_at")
    .eq("world_id", worldId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, tags: (data ?? []) as WorldTag[] };
}

// Lettres (accents inclus) et chiffres uniquement — ni espaces, ni apostrophes,
// ni ponctuation ou autres symboles (la virgule casserait aussi le filtrage
// par `tags` dans l'URL de /explore, voir exploreQuery.ts).
const TAG_FORMAT = /^[\p{L}\p{N}]+$/u;

export async function addWorldTag(worldId: string, rawTag: string) {
  const tag = rawTag.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
  if (!tag) return { ok: false as const, error: "Tag vide." };
  if (!TAG_FORMAT.test(tag)) {
    return { ok: false as const, error: "Un tag ne peut contenir que des lettres et des chiffres." };
  }

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("world_tags")
    .select("id", { count: "exact", head: true })
    .eq("world_id", worldId);
  if (countError) return { ok: false as const, error: countError.message };
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
    if (error.code === "23514") return { ok: false as const, error: "Format de tag invalide." };
    return { ok: false as const, error: error.message };
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
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function setWorldTimeline(
  worldId: string,
  enabled: boolean,
  config?: WorldTimelineConfig | null,
) {
  const supabase = await createClient();
  const updates: Record<string, unknown> = { timeline_enabled: enabled };
  if (config !== undefined) updates.timeline_config = config;
  const { error } = await supabase.from("worlds").update(updates).eq("id", worldId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
