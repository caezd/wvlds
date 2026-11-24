import { z } from "zod";

/**
 * L'inventaire d'un persona (migration 247), tenu par la base.
 *
 * Le monde choisit qui y fait entrer des objets :
 * - `free` : le joueur crée et modifie ses objets, du catalogue ou non ;
 * - `catalog` : le joueur pioche lui-même dans le catalogue, rien d'autre ;
 * - `held` : le joueur n'ajoute rien — objets reçus du MJ, achetés ou échangés.
 * Qui gère l'économie peut toujours donner ou retirer un objet du catalogue.
 *
 * Les emplacements : un objet empilable prend un emplacement, quelle que
 * soit sa quantité ; un objet unique, un par exemplaire. La quantité
 * maximale du catalogue plafonne ce qu'un persona en détient. Un monde à 0
 * emplacement de départ ne compte pas.
 *
 * Fonctions pures, voir `lib/__tests__/personaInventory.test.ts`. La base
 * tient les mêmes règles (`inventory_slots_of`, `persona_inventory_can_edit`).
 */

export const INVENTORY_MODES = ["free", "catalog", "held"] as const;
export type InventoryMode = (typeof INVENTORY_MODES)[number];

/** Plafond du site, pour le nombre de départ comme pour le plafond d'un monde. */
export const MAX_INVENTORY_SLOTS = 1000;
/** Plafond du prix d'un emplacement, en unités de base. */
export const MAX_SLOT_COST = 1_000_000_000_000;
/** Plafond de la quantité d'une ligne d'inventaire. */
export const MAX_ITEM_QUANTITY = 1_000_000;

export function inventoryModeOf(row: { inventory_mode?: string | null } | null | undefined): InventoryMode {
  const mode = row?.inventory_mode;
  return (INVENTORY_MODES as readonly unknown[]).includes(mode) ? (mode as InventoryMode) : "free";
}

/** Le joueur peut-il ajouter lui-même un objet de cette sorte ? */
export function ownerCanAdd(mode: InventoryMode, kind: "custom" | "catalog"): boolean {
  if (mode === "free") return true;
  if (mode === "catalog") return kind === "catalog";
  return false;
}

/** Une ligne d'inventaire ; `stackable` vient du catalogue (une saisie libre s'empile). */
export type SlotItem = { quantity: number; stackable: boolean | null };

/** Les emplacements d'une ligne. */
export function slotsOf(item: SlotItem): number {
  const qty = Math.max(0, Math.floor(item.quantity));
  if (item.stackable === false) return qty;
  return qty > 0 ? 1 : 0;
}

export function slotsUsed(items: readonly SlotItem[]): number {
  return items.reduce((sum, item) => sum + slotsOf(item), 0);
}

export type InventorySettings = {
  /** Emplacements de départ ; 0 : illimité. */
  slotsDefault: number;
  /** Plafond après agrandissement ; `null` : celui du site. */
  slotsMax: number | null;
  /** Prix d'un emplacement ajouté, en unités de base ; `null` : pas d'agrandissement. */
  slotCost: number | null;
};

export const DEFAULT_INVENTORY_SETTINGS: InventorySettings = { slotsDefault: 0, slotsMax: null, slotCost: null };

type SettingsRow = {
  inventory_slots_default?: number | null;
  inventory_slots_max?: number | null;
  inventory_slot_cost?: number | string | null;
};

export function inventorySettingsOf(row: SettingsRow | null | undefined): InventorySettings {
  const cost = row?.inventory_slot_cost;
  return {
    slotsDefault: typeof row?.inventory_slots_default === "number" ? row.inventory_slots_default : 0,
    slotsMax: typeof row?.inventory_slots_max === "number" ? row.inventory_slots_max : null,
    slotCost: cost === null || cost === undefined ? null : Number(cost),
  };
}

/** Capacité d'un inventaire ; `null` : illimitée. */
export function inventoryCapacity(settings: InventorySettings, extraSlots: number): number | null {
  if (settings.slotsDefault === 0) return null;
  return settings.slotsDefault + extraSlots;
}

/**
 * L'agrandissement possible : le prix d'un emplacement et combien il en
 * reste à acheter ; `null` s'il n'y en a pas (économie coupée, pas de prix,
 * inventaire illimité, plafond atteint).
 */
export function slotExtension(
  settings: InventorySettings,
  extraSlots: number,
  economyOn: boolean,
): { cost: number; remaining: number } | null {
  if (!economyOn || settings.slotCost === null || settings.slotsDefault === 0) return null;
  const cap = settings.slotsMax ?? MAX_INVENTORY_SLOTS;
  const remaining = cap - (settings.slotsDefault + extraSlots);
  return remaining > 0 ? { cost: settings.slotCost, remaining } : null;
}

/** Ce que l'action serveur accepte pour les réglages des emplacements. */
export const inventorySettingsSchema = z
  .strictObject({
    inventory_slots_default: z.number().int().min(0).max(MAX_INVENTORY_SLOTS),
    inventory_slots_max: z.number().int().min(1).max(MAX_INVENTORY_SLOTS).nullable(),
    inventory_slot_cost: z.number().int().min(0).max(MAX_SLOT_COST).nullable(),
  })
  .refine((s) => s.inventory_slots_max === null || s.inventory_slots_max >= s.inventory_slots_default);

export type InventorySettingsPatch = z.input<typeof inventorySettingsSchema>;
