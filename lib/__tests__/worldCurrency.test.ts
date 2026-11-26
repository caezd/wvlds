import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_CURRENCY_UNITS,
  MAX_CURRENCY_ICON_LENGTH,
  MAX_CURRENCY_UNITS,
  MAX_CURRENCY_VALUE,
  amountFromCounts,
  currencyUnitsOf,
  currencyUnitsSchema,
  formatAmount,
  ratioRowsOf,
  splitAmount,
  unitsFromRatioRows,
  type CurrencyUnit,
} from "@/lib/worldCurrency";

const GOLD: CurrencyUnit[] = [
  { name: "Or", short: "po", value: 10_000 },
  { name: "Argent", short: "pa", value: 100 },
  { name: "Cuivre", short: "pc", value: 1 },
];

describe("currencyUnitsOf", () => {
  it("trie les paliers du plus grand au plus petit", () => {
    expect(currencyUnitsOf([GOLD[2], GOLD[0], GOLD[1]])).toEqual(GOLD);
  });

  it("une configuration absente ou invalide rend la monnaie par défaut", () => {
    expect(currencyUnitsOf(null)).toEqual(DEFAULT_CURRENCY_UNITS);
    expect(currencyUnitsOf([{ name: "Or", short: "", value: 10 }])).toEqual(DEFAULT_CURRENCY_UNITS);
    expect(DEFAULT_CURRENCY_UNITS).toHaveLength(1);
    expect(DEFAULT_CURRENCY_UNITS[0].value).toBe(1);
  });
});

describe("currencyUnitsSchema", () => {
  const ok = (units: unknown) => currencyUnitsSchema.safeParse(units).success;

  it("accepte des paliers dont chacun est un multiple du suivant", () => {
    expect(ok(GOLD)).toBe(true);
    expect(ok([{ name: "Galion", short: "", value: 500 }, { name: "Mornille", short: "", value: 29 }, { name: "Noise", short: "", value: 1 }])).toBe(false);
    expect(ok([{ name: "Galion", short: "", value: 29 * 17 }, { name: "Mornille", short: "", value: 29 }, { name: "Noise", short: "", value: 1 }])).toBe(true);
  });

  it("exige exactement une unité de base, valant 1", () => {
    expect(ok([{ name: "Or", short: "", value: 100 }])).toBe(false);
    expect(ok([{ name: "A", short: "", value: 1 }, { name: "B", short: "", value: 1 }])).toBe(false);
  });

  it("refuse un nom vide, une abréviation trop longue, trop de paliers", () => {
    expect(ok([{ name: " ", short: "", value: 1 }])).toBe(false);
    expect(ok([{ name: "Or", short: "1234567", value: 1 }])).toBe(false);
    const many = Array.from({ length: MAX_CURRENCY_UNITS + 1 }, (_, i) => ({ name: `U${i}`, short: "", value: 10 ** i }));
    expect(ok(many)).toBe(false);
  });

  it("refuse un champ inconnu", () => {
    expect(ok([{ name: "Or", short: "", value: 1, rate: 2 }])).toBe(false);
  });

  it("accepte un aspect par palier : couleur, icône, image (migration 265)", () => {
    expect(ok([{ name: "Or", short: "po", value: 1, color: "#d4a017", icon: "coins" }])).toBe(true);
    expect(ok([{ name: "Or", short: "po", value: 1, color: "#d4a01780" }])).toBe(true);
    expect(ok([{ name: "Or", short: "po", value: 1, image: "https://exemple.org/or.webp" }])).toBe(true);
  });

  it("refuse un aspect mal formé", () => {
    expect(ok([{ name: "Or", short: "", value: 1, color: "doré" }])).toBe(false);
    expect(ok([{ name: "Or", short: "", value: 1, icon: "Coins<script>" }])).toBe(false);
    expect(ok([{ name: "Or", short: "", value: 1, icon: "a".repeat(65) }])).toBe(false);
    expect(ok([{ name: "Or", short: "", value: 1, image: "javascript:alert(1)" }])).toBe(false);
  });
});

describe("aspect des paliers", () => {
  const ASPECT: CurrencyUnit[] = [
    { name: "Or", short: "po", value: 100, color: "#d4a017", icon: "coins" },
    { name: "Cuivre", short: "pc", value: 1, image: "https://exemple.org/cuivre.webp" },
  ];

  it("currencyUnitsOf garde l'aspect", () => {
    expect(currencyUnitsOf(ASPECT)).toEqual(ASPECT);
  });

  it("l'éditeur par taux garde l'aspect de chaque palier", () => {
    const rows = ratioRowsOf(ASPECT);
    expect(rows[0]).toMatchObject({ color: "#d4a017", icon: "coins" });
    expect(rows[1]).toMatchObject({ image: "https://exemple.org/cuivre.webp" });
    expect(unitsFromRatioRows(rows)).toEqual(ASPECT);
  });

  it("un palier sans aspect n'en reçoit pas de clé vide", () => {
    expect(Object.keys(unitsFromRatioRows(ratioRowsOf(GOLD))[0]).sort()).toEqual(["name", "short", "value"]);
  });
});

describe("migration 265", () => {
  const sql = readFileSync(path.join(process.cwd(), "migrations/265_currency_appearance.sql"), "utf8");

  it("la base accepte les mêmes clés que l'interface", () => {
    expect(sql).toContain("k NOT IN ('name', 'short', 'value', 'color', 'icon', 'image')");
    expect(sql).toContain("public.is_hex_color(v_entry->>'color')");
    expect(sql).toContain("public.is_http_url(v_entry->>'image')");
    expect(sql).toContain(`char_length(v_entry->>'icon') BETWEEN 1 AND ${MAX_CURRENCY_ICON_LENGTH}`);
  });

  it("les images des paliers se déposent sous world-<id>/currency/, pour qui gère l'économie", () => {
    expect(sql).toMatch(/\/currency\/'\s+AND public\.has_world_permission\([^;]+'economy\.manage'\)/);
  });
});

describe("splitAmount", () => {
  it("500 cuivres font 5 argents", () => {
    expect(splitAmount(500, GOLD)).toEqual([{ unit: GOLD[1], count: 5 }]);
  });

  it("décompose sur tous les paliers, sans les zéros", () => {
    expect(splitAmount(12_345, GOLD)).toEqual([
      { unit: GOLD[0], count: 1 },
      { unit: GOLD[1], count: 23 },
      { unit: GOLD[2], count: 45 },
    ]);
    expect(splitAmount(10_007, GOLD)).toEqual([
      { unit: GOLD[0], count: 1 },
      { unit: GOLD[2], count: 7 },
    ]);
  });

  it("zéro s'écrit dans l'unité de base", () => {
    expect(splitAmount(0, GOLD)).toEqual([{ unit: GOLD[2], count: 0 }]);
  });

  it("un montant négatif se décompose sur sa valeur absolue", () => {
    expect(splitAmount(-500, GOLD)).toEqual([{ unit: GOLD[1], count: 5 }]);
  });
});

describe("formatAmount", () => {
  it("écrit chaque palier avec son abréviation", () => {
    expect(formatAmount(12_345, GOLD)).toBe("1 po 23 pa 45 pc");
  });

  it("sans abréviation, le nom", () => {
    expect(formatAmount(3, DEFAULT_CURRENCY_UNITS)).toBe(`3 ${DEFAULT_CURRENCY_UNITS[0].name}`);
  });

  it("signe les débits, et les crédits sur demande", () => {
    expect(formatAmount(-500, GOLD)).toBe("−5 pa");
    expect(formatAmount(500, GOLD, { signed: true })).toBe("+5 pa");
    expect(formatAmount(0, GOLD, { signed: true })).toBe("0 pc");
  });
});

describe("amountFromCounts", () => {
  it("additionne les paliers saisis, rangés comme les unités", () => {
    expect(amountFromCounts([1, 23, 45], GOLD)).toBe(12_345);
    expect(amountFromCounts([0, 0, 500], GOLD)).toBe(500);
  });

  it("ignore les saisies vides ou négatives", () => {
    expect(amountFromCounts([Number.NaN, -2, 3], GOLD)).toBe(3);
  });
});

describe("taux entre paliers", () => {
  it("chaque palier s'exprime en nombre du palier suivant", () => {
    expect(ratioRowsOf(GOLD)).toEqual([
      { name: "Or", short: "po", ratio: 100 },
      { name: "Argent", short: "pa", ratio: 100 },
      { name: "Cuivre", short: "pc", ratio: 1 },
    ]);
  });

  it("les taux rendent les valeurs absolues, la dernière ligne valant 1", () => {
    expect(unitsFromRatioRows(ratioRowsOf(GOLD))).toEqual(GOLD);
    expect(
      unitsFromRatioRows([
        { name: "Galion", short: "", ratio: 17 },
        { name: "Mornille", short: "", ratio: 29 },
        { name: "Noise", short: "", ratio: 99 },
      ]).map((u) => u.value),
    ).toEqual([493, 29, 1]);
  });
});

describe("migration 246", () => {
  const sql = readFileSync(path.join(process.cwd(), "migrations/246_world_economy.sql"), "utf8");

  it("la monnaie par défaut de la base est celle de l'interface", () => {
    const m = sql.match(/currency_units\s+jsonb\s+NOT NULL DEFAULT '([^']+)'::jsonb/);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1])).toEqual(DEFAULT_CURRENCY_UNITS);
  });

  it("la base tient les mêmes bornes que l'interface", () => {
    expect(sql).toContain(`jsonb_array_length(p_units) BETWEEN 1 AND ${MAX_CURRENCY_UNITS}`);
    expect(sql).toContain(`BETWEEN 1 AND ${MAX_CURRENCY_VALUE}`);
  });

  it("un solde ne s'écrit que par les fonctions de la base", () => {
    expect(sql).not.toMatch(/CREATE POLICY[^;]+ON public\.persona_wallets\s+FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.economy_apply\([^)]*\) FROM PUBLIC, anon, authenticated/);
  });
});
