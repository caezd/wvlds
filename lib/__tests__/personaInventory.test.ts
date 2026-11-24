import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_INVENTORY_SETTINGS,
  INVENTORY_MODES,
  MAX_INVENTORY_SLOTS,
  inventoryCapacity,
  inventoryModeOf,
  inventorySettingsOf,
  inventorySettingsSchema,
  ownerCanAdd,
  slotExtension,
  slotsOf,
  slotsUsed,
} from "@/lib/personaInventory";

describe("inventoryModeOf", () => {
  it("lit le mode du monde ; inconnu ou absent : libre", () => {
    expect(inventoryModeOf({ inventory_mode: "held" })).toBe("held");
    expect(inventoryModeOf({ inventory_mode: "x" })).toBe("free");
    expect(inventoryModeOf(null)).toBe("free");
    expect(INVENTORY_MODES).toEqual(["free", "catalog", "held"]);
  });
});

describe("ownerCanAdd", () => {
  it("libre : tout ; catalogue : les objets du catalogue seuls ; tenu : rien", () => {
    expect(ownerCanAdd("free", "custom")).toBe(true);
    expect(ownerCanAdd("free", "catalog")).toBe(true);
    expect(ownerCanAdd("catalog", "custom")).toBe(false);
    expect(ownerCanAdd("catalog", "catalog")).toBe(true);
    expect(ownerCanAdd("held", "custom")).toBe(false);
    expect(ownerCanAdd("held", "catalog")).toBe(false);
  });
});

describe("emplacements", () => {
  it("un objet empilable tient sur un seul emplacement, quelle que soit sa quantité", () => {
    expect(slotsOf({ quantity: 30, stackable: true })).toBe(1);
    expect(slotsOf({ quantity: 30, stackable: null })).toBe(1);
  });

  it("un objet unique prend un emplacement par exemplaire", () => {
    expect(slotsOf({ quantity: 3, stackable: false })).toBe(3);
  });

  it("additionne les emplacements de l'inventaire", () => {
    expect(slotsUsed([
      { quantity: 3, stackable: false },
      { quantity: 45, stackable: true },
    ])).toBe(4);
  });

  it("capacité : le nombre de départ plus les emplacements achetés ; 0 au départ = illimité", () => {
    expect(inventoryCapacity({ ...DEFAULT_INVENTORY_SETTINGS, slotsDefault: 10 }, 4)).toBe(14);
    expect(inventoryCapacity({ ...DEFAULT_INVENTORY_SETTINGS, slotsDefault: 0 }, 4)).toBeNull();
  });
});

describe("slotExtension", () => {
  const base = { slotsDefault: 10, slotsMax: 12, slotCost: 100 };

  it("on agrandit jusqu'au plafond, au prix d'un emplacement", () => {
    expect(slotExtension(base, 0, true)).toEqual({ cost: 100, remaining: 2 });
    expect(slotExtension(base, 2, true)).toBeNull();
  });

  it("ni sans économie, ni sans prix, ni sans limite de départ", () => {
    expect(slotExtension(base, 0, false)).toBeNull();
    expect(slotExtension({ ...base, slotCost: null }, 0, true)).toBeNull();
    expect(slotExtension({ ...base, slotsDefault: 0 }, 0, true)).toBeNull();
  });

  it("sans plafond, le plafond du site", () => {
    expect(slotExtension({ ...base, slotsMax: null }, 0, true)).toEqual({ cost: 100, remaining: MAX_INVENTORY_SLOTS - 10 });
  });
});

describe("réglages", () => {
  it("lit les colonnes du monde, défauts sinon", () => {
    expect(inventorySettingsOf({ inventory_slots_default: 10, inventory_slots_max: 20, inventory_slot_cost: 50 }))
      .toEqual({ slotsDefault: 10, slotsMax: 20, slotCost: 50 });
    expect(inventorySettingsOf(null)).toEqual(DEFAULT_INVENTORY_SETTINGS);
    expect(DEFAULT_INVENTORY_SETTINGS).toEqual({ slotsDefault: 0, slotsMax: null, slotCost: null });
  });

  it("le plafond ne descend pas sous le nombre de départ", () => {
    const ok = (v: unknown) => inventorySettingsSchema.safeParse(v).success;
    expect(ok({ inventory_slots_default: 10, inventory_slots_max: 20, inventory_slot_cost: 5 })).toBe(true);
    expect(ok({ inventory_slots_default: 10, inventory_slots_max: 5, inventory_slot_cost: 5 })).toBe(false);
    expect(ok({ inventory_slots_default: 0, inventory_slots_max: null, inventory_slot_cost: null })).toBe(true);
    expect(ok({ inventory_slots_default: MAX_INVENTORY_SLOTS + 1, inventory_slots_max: null, inventory_slot_cost: null })).toBe(false);
    expect(ok({ inventory_slots_default: 1, inventory_slots_max: null, inventory_slot_cost: -1 })).toBe(false);
  });
});

describe("migration 247", () => {
  const sql = readFileSync(path.join(process.cwd(), "migrations/247_persona_inventory.sql"), "utf8");

  it("les bornes de la base sont celles de l'interface", () => {
    expect(sql).toContain(`inventory_slots_default BETWEEN 0 AND ${MAX_INVENTORY_SLOTS}`);
    expect(sql).toMatch(/inventory_mode\s+text\s+NOT NULL DEFAULT 'free'/);
    expect(sql).toContain("inventory_mode IN ('free', 'catalog', 'held')");
  });

  it("les fonctions internes ne sont pas appelables par les joueurs", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.persona_inventory_can_edit\([^)]*\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.inventory_slots_of\([^)]*\) FROM PUBLIC, anon, authenticated/);
  });
});
