import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * `getWorldById` choisit ses colonnes une à une : une option du monde qu'il
 * oublie vaut `undefined` partout côté serveur — vue absente du menu, option
 * affichée coupée dans les paramètres. Les options de l'économie y étaient
 * passées à la trappe (enable_shops, enable_trades). `cache()` de React ne se
 * réinitialise pas hors rendu : on lit la liste dans la source.
 */
describe("getWorldById — les options du monde", () => {
  const source = readFileSync(path.join(process.cwd(), "lib/currentRequest.ts"), "utf8");
  const select = /getWorldById = cache\([\s\S]*?\.select\(\s*"([^"]+)"/.exec(source)?.[1] ?? "";
  const columns = new Set(select.split(",").map((c) => c.trim()));

  it.each(["enable_economy", "enable_inventory", "enable_shops", "enable_trades", "trades_same_account", "tax_enabled", "tax_amount", "tax_every", "tax_unit", "tax_anchor", "tax_mode", "tax_accumulate", "tax_grace_new", "tax_badge_label"])("lit %s", (column) => {
    expect(columns.has(column)).toBe(true);
  });
});
