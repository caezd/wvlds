import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", "__tests__"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, acc);
    else if (full.endsWith(".tsx") && !full.includes(".test.")) acc.push(full);
  }
  return acc;
}

/**
 * Un `aria-label` littéral n'est jamais traduit : il est annoncé tel quel aux
 * lecteurs d'écran, quelle que soit la langue du compte. Quatorze d'entre eux
 * étaient en français — donc lus en français à des comptes anglophones et
 * hispanophones, sans que rien ne le signale à l'écran.
 *
 * Ce test refuse tout nouveau littéral portant des marqueurs de français. Un
 * `aria-label` littéral en anglais reste toléré : plusieurs viennent de
 * primitives shadcn et ne sont pas du texte applicatif.
 */
const FRENCH =
  /[àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]|\b(le|la|les|un|une|des|du|de|vous|votre|est|sont|pour|avec|dans|sur|aucun|aucune|cette|ces)\b/i;

describe("aria-label", () => {
  it("n'est jamais un littéral français", () => {
    const offenders: string[] = [];
    for (const file of [join(ROOT, "app"), join(ROOT, "components")].flatMap((d) => tsxFiles(d))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/aria-label="([^"{}]{3,})"/g)) {
        if (!FRENCH.test(m[1])) continue;
        const line = src.slice(0, m.index).split("\n").length;
        const rel = file.slice(ROOT.length + 1).split("\\").join("/");
        offenders.push(rel + ":" + line + ' → "' + m[1] + '"');
      }
    }
    expect(offenders, "utilisez une clé de traduction plutôt qu'un littéral").toEqual([]);
  });
});
