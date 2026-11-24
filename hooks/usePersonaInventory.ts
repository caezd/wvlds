"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_INVENTORY_SETTINGS,
  inventoryCapacity,
  inventoryModeOf,
  inventorySettingsOf,
  slotExtension,
  slotsUsed,
  type InventoryMode,
  type InventorySettings,
} from "@/lib/personaInventory";
import type { WorldCatalogCategory, WorldCatalogItem } from "@/types/worlds";

/** L'objet du catalogue joint à une ligne d'inventaire. */
export type InventoryCatalogEntry = Pick<
  WorldCatalogItem,
  "id" | "name" | "description" | "icon" | "lucide_icon" | "image_url" | "rarity" | "stackable" | "max_quantity" | "deleted_at"
>;

/** Une ligne de `persona_items` (migration 247) : objet du catalogue, ou saisie libre. */
export type InventoryRow = {
  id: string;
  catalog_item_id: string | null;
  name: string | null;
  description: string | null;
  /** Icône de jeu (`rpg_icons`) d'une saisie libre — migration 248. */
  icon: string | null;
  lucide_icon: string | null;
  quantity: number;
  sort_index: number;
  catalog: InventoryCatalogEntry | null;
};

export type InventoryError = "full" | "max" | "insufficient" | "funds" | "cap" | "failed";
export type InventoryResult = { ok: true } | { ok: false; error: InventoryError };

const ROW_SELECT =
  "id, catalog_item_id, name, description, icon, lucide_icon, quantity, sort_index, " +
  "catalog:catalog_item_id(id, name, description, icon, lucide_icon, image_url, rarity, stackable, max_quantity, deleted_at)";

/** Les messages de la base (migration 247), ramenés à ce que l'interface dit. */
function errorOf(error: { message?: string } | null): InventoryError {
  const msg = error?.message ?? "";
  if (/inventaire plein/i.test(msg)) return "full";
  if (/quantité maximale/i.test(msg)) return "max";
  if (/solde insuffisant/i.test(msg)) return "funds";
  if (/insuffisant/i.test(msg)) return "insufficient";
  if (/plafond/i.test(msg)) return "cap";
  return "failed";
}

/**
 * L'inventaire d'un persona : ses objets, ses emplacements, le catalogue où
 * piocher, et ce qu'on peut y faire. La base tranche qui a le droit de quoi
 * (`persona_inventory_can_edit`) : le hook ne fait que relayer.
 *
 * `off` quand l'inventaire est coupé dans le monde : rien d'autre n'est lu.
 */
export function usePersonaInventory(personaId: string | null, worldId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<"loading" | "off" | "on">(worldId && personaId ? "loading" : "off");
  const [mode, setMode] = useState<InventoryMode>("free");
  const [economyOn, setEconomyOn] = useState(false);
  const [settings, setSettings] = useState<InventorySettings>(DEFAULT_INVENTORY_SETTINGS);
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [extra, setExtra] = useState(0);
  const [catalog, setCatalog] = useState<WorldCatalogItem[]>([]);
  const [categories, setCategories] = useState<WorldCatalogCategory[]>([]);

  const readItems = useCallback(
    () =>
      supabase
        .from("persona_items")
        .select(ROW_SELECT)
        .eq("persona_id", personaId!)
        .order("sort_index", { ascending: true })
        .order("created_at", { ascending: true }),
    [supabase, personaId],
  );
  const readWallet = useCallback(
    () => supabase.from("persona_wallets").select("extra_slots").eq("persona_id", personaId!).maybeSingle(),
    [supabase, personaId],
  );

  const reload = useCallback(async () => {
    if (!personaId) return;
    const [{ data: rows }, { data: wallet }] = await Promise.all([readItems(), readWallet()]);
    setItems((rows ?? []) as unknown as InventoryRow[]);
    setExtra(Number((wallet as { extra_slots?: number } | null)?.extra_slots ?? 0));
  }, [personaId, readItems, readWallet]);

  useEffect(() => {
    if (!worldId || !personaId) {
      setStatus("off");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const { data: world } = await supabase
        .from("worlds")
        .select("enable_inventory, enable_economy, inventory_mode, inventory_slots_default, inventory_slots_max, inventory_slot_cost")
        .eq("id", worldId)
        .maybeSingle();
      if (cancelled) return;
      const row = world as ({ enable_inventory?: boolean | null; enable_economy?: boolean | null; inventory_mode?: string | null } & Parameters<typeof inventorySettingsOf>[0]) | null;
      if (!row?.enable_inventory) {
        setStatus("off");
        return;
      }
      const [{ data: rows }, { data: wallet }, { data: entries }, { data: cats }] = await Promise.all([
        readItems(),
        readWallet(),
        supabase
          .from("world_catalog_items")
          .select("id, world_id, type, name, description, icon, lucide_icon, image_url, rarity, stackable, max_quantity, properties, sort_index, category_id")
          .eq("world_id", worldId)
          .eq("type", "inventory")
          .is("deleted_at", null)
          .order("sort_index", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("world_catalog_categories")
          .select("id, world_id, type, name, sort_index, column_index")
          .eq("world_id", worldId)
          .eq("type", "inventory")
          .order("sort_index", { ascending: true }),
      ]);
      if (cancelled) return;
      setMode(inventoryModeOf(row));
      setEconomyOn(row.enable_economy === true);
      setSettings(inventorySettingsOf(row));
      setItems((rows ?? []) as unknown as InventoryRow[]);
      setExtra(Number((wallet as { extra_slots?: number } | null)?.extra_slots ?? 0));
      setCatalog((entries ?? []) as WorldCatalogItem[]);
      setCategories((cats ?? []) as WorldCatalogCategory[]);
      setStatus("on");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, personaId, worldId, readItems, readWallet]);

  const used = useMemo(
    () => slotsUsed(items.map((i) => ({ quantity: i.quantity, stackable: i.catalog ? (i.catalog.stackable ?? true) : null }))),
    [items],
  );
  const capacity = inventoryCapacity(settings, extra);
  const extension = slotExtension(settings, extra, economyOn);

  /** Écrit, puis relit l'inventaire si la base a accepté. */
  const write = useCallback(
    async (run: () => PromiseLike<{ error: { message?: string } | null }>): Promise<InventoryResult> => {
      const { error } = await run();
      if (error) return { ok: false, error: errorOf(error) };
      await reload();
      return { ok: true };
    },
    [reload],
  );

  const nextIndex = items.reduce((max, i) => Math.max(max, i.sort_index), -1) + 1;

  const addCustom = useCallback(
    (name: string, description: string) =>
      write(() =>
        supabase.from("persona_items").insert({
          persona_id: personaId,
          world_id: worldId,
          name: name.trim(),
          description: description.trim() || null,
          quantity: 1,
          sort_index: nextIndex,
        }),
      ),
    [write, supabase, personaId, worldId, nextIndex],
  );

  /** Une entrée du catalogue : sa ligne existante grossit, sinon une ligne naît. */
  const addCatalog = useCallback(
    (catalogItemId: string, quantity: number) => {
      const existing = items.find((i) => i.catalog_item_id === catalogItemId);
      return write(() =>
        existing
          ? supabase.from("persona_items").update({ quantity: existing.quantity + quantity }).eq("id", existing.id)
          : supabase.from("persona_items").insert({
              persona_id: personaId,
              world_id: worldId,
              catalog_item_id: catalogItemId,
              quantity,
              sort_index: nextIndex,
            }),
      );
    },
    [write, supabase, items, personaId, worldId, nextIndex],
  );

  const setQuantity = useCallback(
    (rowId: string, quantity: number) =>
      write(() =>
        quantity <= 0
          ? supabase.from("persona_items").delete().eq("id", rowId)
          : supabase.from("persona_items").update({ quantity }).eq("id", rowId),
      ),
    [write, supabase],
  );

  const removeRow = useCallback(
    (rowId: string) => write(() => supabase.from("persona_items").delete().eq("id", rowId)),
    [write, supabase],
  );

  const updateCustom = useCallback(
    (rowId: string, name: string, description: string) =>
      write(() =>
        supabase.from("persona_items").update({ name: name.trim(), description: description.trim() || null }).eq("id", rowId),
      ),
    [write, supabase],
  );

  /** Donner ou retirer un objet du catalogue, pour qui gère l'économie. */
  const give = useCallback(
    (catalogItemId: string, delta: number) =>
      write(() => supabase.rpc("adjust_persona_item", { p_persona: personaId, p_item: catalogItemId, p_delta: delta })),
    [write, supabase, personaId],
  );

  /** Agrandir l'inventaire, payé sur la bourse du persona. */
  const extend = useCallback(
    (slots: number) =>
      write(() => supabase.rpc("extend_persona_inventory", { p_persona: personaId, p_slots: slots })),
    [write, supabase, personaId],
  );

  return {
    status,
    mode,
    economyOn,
    items,
    used,
    capacity,
    extension,
    catalog,
    categories,
    addCustom,
    addCatalog,
    setQuantity,
    removeRow,
    updateCustom,
    give,
    extend,
  };
}
