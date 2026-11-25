import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createSupabaseMock } from "@/test/supabaseMock";
import {
  ACTIVITY_KINDS,
  ACTIVITY_PAGE_SIZE,
  activityBalanceEffect,
  fetchWorldActivity,
  formatActivityItems,
  type WorldActivityEntry,
} from "@/lib/worldActivity";

const sql = readFileSync(path.join(process.cwd(), "migrations/254_world_activity.sql"), "utf8");

function entree(partial: Partial<WorldActivityEntry> = {}): WorldActivityEntry {
  return {
    id: "a1",
    domain: "economy",
    kind: "purchase",
    actor_id: "u1",
    actor: { username: "cae" },
    persona_id: "p1",
    persona_name: "Brom",
    target_persona_id: null,
    target_persona_name: null,
    amount: 120,
    items: [],
    note: null,
    ref_id: null,
    data: {},
    created_at: "2026-11-25T10:00:00.000Z",
    ...partial,
  };
}

describe("migration 254", () => {
  it("les genres du journal sont ceux de la base (la 255 y ajoute la taxe)", () => {
    const m = sql.match(/world_activity_kind_check CHECK \(kind IN \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    const enBase = [...m![1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
    expect(enBase).toEqual(ACTIVITY_KINDS.slice(0, enBase.length));
  });

  it("le journal s'écrit par la base seule : aucune policy d'écriture", () => {
    expect(sql).toContain("CREATE POLICY world_activity_select ON public.world_activity");
    expect(sql).not.toMatch(/CREATE POLICY world_activity_(insert|update|delete)/);
  });

  it("le domaine économie se lit avec economy.manage", () => {
    expect(sql).toMatch(/WHEN 'economy' THEN 'economy\.manage'/);
  });

  it("les fonctions internes ne sont pas appelables par les clients", () => {
    for (const sig of [
      "log_world_activity(text, uuid, uuid, uuid, bigint, jsonb, text, uuid, jsonb)",
      "economy_apply(uuid, bigint, text, text, uuid, uuid)",
      "activity_catalog_item(uuid, integer)",
      "tg_world_transfers_activity()",
    ]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${sig.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`));
    }
  });

  it("les gains automatiques n'entrent pas au journal", () => {
    expect(sql).not.toMatch(/log_world_activity\(\s*'gain/);
    expect(ACTIVITY_KINDS.some((k) => k.startsWith("gain"))).toBe(false);
  });
});

describe("activityBalanceEffect", () => {
  it("ce que l'événement a fait au solde du persona", () => {
    expect(activityBalanceEffect(entree({ kind: "balance_adjust", amount: -50 }))).toBe(-50);
    expect(activityBalanceEffect(entree({ kind: "balance_adjust", amount: 50 }))).toBe(50);
    expect(activityBalanceEffect(entree({ kind: "purchase", amount: 120 }))).toBe(-120);
    expect(activityBalanceEffect(entree({ kind: "slots_purchase", amount: 30 }))).toBe(-30);
    expect(activityBalanceEffect(entree({ kind: "sale", amount: 40 }))).toBe(40);
    // L'échange : vu du donneur.
    expect(activityBalanceEffect(entree({ kind: "transfer", amount: 10 }))).toBe(-10);
    expect(activityBalanceEffect(entree({ kind: "item_adjust", amount: 0 }))).toBe(0);
    // La taxe payée sort de la bourse ; une dette annulée n'y touche pas.
    expect(activityBalanceEffect(entree({ kind: "tax_payment", amount: 100 }))).toBe(-100);
    expect(activityBalanceEffect(entree({ kind: "tax_waive", amount: 100 }))).toBe(0);
  });
});

describe("formatActivityItems", () => {
  const objet = (name: string, quantity: number) => ({
    catalog_item_id: null, name, icon: null, lucide_icon: null, image_url: null, quantity,
  });

  it("nom et quantité, la quantité 1 sous-entendue", () => {
    expect(formatActivityItems([objet("Épée", 1), objet("Potion", 3)])).toBe("Épée, Potion ×3");
  });

  it("signé pour un don ou un retrait", () => {
    expect(formatActivityItems([objet("Épée", 2)], { signed: true })).toBe("+2 Épée");
    expect(formatActivityItems([objet("Épée", -1)], { signed: true })).toBe("−1 Épée");
  });

  it("vide sans objets", () => {
    expect(formatActivityItems([])).toBe("");
  });
});

describe("fetchWorldActivity", () => {
  const lignes = (n: number) =>
    Array.from({ length: n }, (_, i) => entree({ id: `a${i}`, created_at: `2026-11-25T10:00:${String(59 - i).padStart(2, "0")}.000Z` }));

  it("le monde et l'économie, du plus récent au plus ancien, une ligne de plus pour savoir s'il en reste", async () => {
    const mock = createSupabaseMock({ results: [{ data: lignes(3) }] });
    const page = await fetchWorldActivity(mock.client as never, "w1");
    const { table, builder } = mock.builders[0];
    expect(table).toBe("world_activity");
    expect(builder.eq).toHaveBeenCalledWith("world_id", "w1");
    expect(builder.eq).toHaveBeenCalledWith("domain", "economy");
    expect(builder.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(builder.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(ACTIVITY_PAGE_SIZE + 1);
    expect(page.entries).toHaveLength(3);
    expect(page.cursor).toBeNull();
  });

  it("une page pleine rend le curseur de la suivante", async () => {
    const mock = createSupabaseMock({ results: [{ data: lignes(3) }] });
    const page = await fetchWorldActivity(mock.client as never, "w1", {}, null, 2);
    expect(page.entries.map((e) => e.id)).toEqual(["a0", "a1"]);
    expect(page.cursor).toEqual({ created_at: "2026-11-25T10:00:58.000Z", id: "a1" });
  });

  it("le curseur reprend après la dernière ligne lue, à date égale par identifiant", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }] });
    await fetchWorldActivity(mock.client as never, "w1", {}, { created_at: "2026-11-25T10:00:58.000Z", id: "a1" });
    expect(mock.builders[0].builder.or).toHaveBeenCalledWith(
      "created_at.lt.2026-11-25T10:00:58.000Z,and(created_at.eq.2026-11-25T10:00:58.000Z,id.lt.a1)",
    );
  });

  it("filtres : types (plusieurs), persona (donneur ou receveur), période en jours locaux", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }] });
    const pid = "6f1c2d3e-0000-4000-8000-000000000001";
    await fetchWorldActivity(mock.client as never, "w1", {
      kinds: ["transfer", "sale"],
      personaId: pid,
      from: "2026-11-01",
      to: "2026-11-24",
    });
    const b = mock.builders[0].builder;
    expect(b.in).toHaveBeenCalledWith("kind", ["transfer", "sale"]);
    expect(b.or).toHaveBeenCalledWith(`persona_id.eq.${pid},target_persona_id.eq.${pid}`);
    expect(b.gte).toHaveBeenCalledWith("created_at", new Date(2026, 10, 1).toISOString());
    // Le dernier jour est compris : on s'arrête au lendemain minuit.
    expect(b.lt).toHaveBeenCalledWith("created_at", new Date(2026, 10, 25).toISOString());
  });

  it("aucun type coché : tous les types", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }] });
    await fetchWorldActivity(mock.client as never, "w1", { kinds: [] });
    expect(mock.builders[0].builder.in).not.toHaveBeenCalled();
  });

  it("un identifiant de persona mal formé est ignoré (rien n'entre dans le filtre brut)", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }] });
    await fetchWorldActivity(mock.client as never, "w1", { personaId: "x,id.neq.0" });
    expect(mock.builders[0].builder.or).not.toHaveBeenCalled();
  });

  it("une erreur rend une page vide", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: { message: "boom" } }] });
    expect(await fetchWorldActivity(mock.client as never, "w1")).toEqual({ entries: [], cursor: null, error: true });
  });

  it("les montants arrivent en nombres (bigint lu en texte)", async () => {
    const mock = createSupabaseMock({ results: [{ data: [{ ...entree(), amount: "120" }] }] });
    const page = await fetchWorldActivity(mock.client as never, "w1");
    expect(page.entries[0].amount).toBe(120);
  });
});
