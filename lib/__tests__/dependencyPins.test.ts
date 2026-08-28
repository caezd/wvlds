import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Aucune dépendance ne doit être déclarée en `latest` (ni `*`, ni `>=`).
//
// Ce n'est pas une préférence de style. `@supabase/supabase-js` était en
// `latest` : régénérer le lockfile l'a fait passer de 2.79 à 2.112 sans que
// personne ne le demande, et cette version majeure a changé un comportement —
// `.on()` après `subscribe()` levait au lieu d'être ignoré. Le tiroir latéral
// s'est mis à planter, sans qu'aucune ligne de code applicatif n'ait bougé.
//
// Une plage `^x.y.z` garde les correctifs sans la surprise.
// ──────────────────────────────────────────────────────────────────────────

const FLOTTANTES = /^(latest|\*|x|>=?|~?\s*$)/;

describe("versions des dépendances", () => {
  const pkg = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf-8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  it("aucune n'est déclarée en `latest` ou équivalent", () => {
    const flottantes: string[] = [];
    for (const section of ["dependencies", "devDependencies"] as const) {
      for (const [nom, plage] of Object.entries(pkg[section] ?? {})) {
        // Les protocoles locaux (workspace:, file:, link:) ne flottent pas.
        if (/^(workspace|file|link|catalog):/.test(plage)) continue;
        if (FLOTTANTES.test(plage.trim())) flottantes.push(`${nom}: "${plage}"  [${section}]`);
      }
    }
    expect(
      flottantes,
      "dépendance sans version épinglée : une régénération du lockfile peut " +
        "changer de version majeure sans que personne ne l'ait demandé",
    ).toEqual([]);
  });

  it("le fichier déclare bien des dépendances", () => {
    // Garde-fou du garde-fou : sans lui, un package.json vide passerait.
    expect(Object.keys(pkg.dependencies ?? {}).length).toBeGreaterThan(10);
  });
});
