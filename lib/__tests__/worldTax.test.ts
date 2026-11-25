import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  TAX_UNITS,
  taxSettingsOf,
  taxSettingsSchema,
  taxStatusOf,
  type TaxDue,
} from "@/lib/worldTax";
import { ACTIVITY_KINDS } from "@/lib/worldActivity";

const sql = readFileSync(path.join(process.cwd(), "migrations/255_world_tax.sql"), "utf8");
const sql256 = readFileSync(path.join(process.cwd(), "migrations/256_world_tax_badge_style.sql"), "utf8");

describe("migration 255", () => {
  it("les genres du journal sont ceux de la base, taxe comprise", () => {
    const m = sql.match(/world_activity_kind_check CHECK \(kind IN \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    const enBase = [...m![1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
    expect(enBase).toEqual([...ACTIVITY_KINDS]);
    expect(ACTIVITY_KINDS).toContain("tax_payment");
    expect(ACTIVITY_KINDS).toContain("tax_waive");
  });

  it("les unités de récurrence sont celles de la base", () => {
    const m = sql.match(/tax_unit IN \(([^)]*)\)/);
    expect([...m![1].matchAll(/'(\w+)'/g)].map((x) => x[1])).toEqual([...TAX_UNITS]);
  });

  it("les dettes s'écrivent par la base seule : aucune policy d'écriture", () => {
    expect(sql).toContain("CREATE POLICY persona_tax_dues_select ON public.persona_tax_dues");
    expect(sql).not.toMatch(/CREATE POLICY persona_tax_dues_(insert|update|delete)/);
  });

  it("les fonctions internes ne sont pas appelables par les clients", () => {
    for (const sig of [
      "tax_period_bounds(timestamptz, integer, text, timestamptz)",
      "tax_collect(uuid, uuid)",
      "tax_assess_world(uuid)",
      "tax_assess_all()",
    ]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${sig.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`));
    }
  });

  it("payer et annuler : des RPC pour les connectés seulement", () => {
    for (const sig of ["pay_persona_tax(uuid)", "waive_persona_tax(uuid)"]) {
      const s = sig.replace(/[()]/g, "\\$&");
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${s} FROM PUBLIC, anon`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${s} TO authenticated`));
    }
    // Annuler une dette : qui gère l'économie.
    expect(sql).toMatch(/waive_persona_tax[\s\S]*has_world_permission\(v_world, v_uid, 'economy\.manage'\)/);
  });

  it("les échéances passent par pg_cron", () => {
    expect(sql).toMatch(/cron\.schedule\('assess-world-taxes'/);
  });

  it("le paiement passe par economy_apply (bourse et journal des soldes)", () => {
    expect(sql).toMatch(/economy_apply\(\s*p_persona, -v_total, 'tax'/);
  });
});

describe("migration 256", () => {
  it("la couleur et l'icône du badge, contrôlées par la base", () => {
    expect(sql256).toMatch(/tax_badge_color IS NULL OR public\.is_hex_color\(tax_badge_color\)/);
    expect(sql256).toMatch(/char_length\(tax_badge_icon\) <= 64/);
  });

  it("la vue du badge les rend, sans perdre ses colonnes", () => {
    expect(sql256).toMatch(/CREATE OR REPLACE VIEW public\.persona_tax_overdue[\s\S]*badge_label,[\s\S]*w\.tax_badge_color AS badge_color,[\s\S]*w\.tax_badge_icon\s+AS badge_icon/);
    expect(sql256).toContain("security_invoker = true");
  });
});

describe("taxSettingsSchema", () => {
  const ok = {
    tax_enabled: true,
    tax_amount: 100,
    tax_every: 1,
    tax_unit: "month",
    tax_anchor: "2026-11-01T04:00:00.000Z",
    tax_mode: "manual",
    tax_accumulate: true,
    tax_grace_new: true,
    tax_badge_label: "Impayé",
    tax_badge_color: "#e8553a",
    tax_badge_icon: "skull",
  };

  it("accepte des réglages complets", () => {
    expect(taxSettingsSchema.safeParse(ok).success).toBe(true);
    expect(taxSettingsSchema.safeParse({ ...ok, tax_badge_label: null }).success).toBe(true);
    expect(taxSettingsSchema.safeParse({ ...ok, tax_badge_color: null, tax_badge_icon: null }).success).toBe(true);
  });

  it("refuse les valeurs hors bornes et les clés inconnues", () => {
    expect(taxSettingsSchema.safeParse({ ...ok, tax_every: 0 }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ ...ok, tax_amount: -1 }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ ...ok, tax_unit: "year" }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ ...ok, tax_mode: "x" }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ ...ok, tax_badge_label: "x".repeat(25) }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ ...ok, autre: 1 }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ ...ok, tax_badge_color: "rouge" }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ ...ok, tax_badge_icon: "Skull Icon" }).success).toBe(false);
  });
});

describe("taxSettingsOf", () => {
  it("des valeurs par défaut pour un monde qui n'a jamais réglé sa taxe", () => {
    const s = taxSettingsOf({});
    expect(s).toMatchObject({
      tax_enabled: false, tax_amount: 0, tax_every: 1, tax_unit: "month", tax_mode: "manual",
      tax_accumulate: true, tax_grace_new: true, tax_badge_label: null, tax_badge_color: null, tax_badge_icon: null,
    });
    expect(typeof s.tax_anchor).toBe("string");
  });

  it("les montants lus en texte (bigint) deviennent des nombres", () => {
    expect(taxSettingsOf({ tax_amount: "250" as unknown as number }).tax_amount).toBe(250);
  });
});

describe("taxStatusOf", () => {
  const now = new Date("2026-11-25T12:00:00.000Z");
  const due = (start: string, end: string, amount = 100): TaxDue => ({
    id: start, period_start: start, period_end: end, amount,
  });

  it("à jour : rien d'échu", () => {
    expect(taxStatusOf([due("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z")], now)).toEqual({
      overdueCount: 0, overdueTotal: 0, unpaidTotal: 100, unpaidCount: 1,
    });
  });

  it("en retard : les périodes échues non payées", () => {
    expect(taxStatusOf([
      due("2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z"),
      due("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z", 150),
      due("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z"),
    ], now)).toEqual({ overdueCount: 2, overdueTotal: 250, unpaidTotal: 350, unpaidCount: 3 });
  });
});
