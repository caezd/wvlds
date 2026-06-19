"use server";

import { createClient } from "@/lib/supabase/server";
import type { WorldInventoryItem, WorldSkill, WorldCatalogCategory } from "@/types/worlds";

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
