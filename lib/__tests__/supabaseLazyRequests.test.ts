import { describe, it, expect } from "vitest";

import { workingSources } from "@/test/sourceFiles";

/**
 * Une requête supabase-js est paresseuse : le constructeur (`.from().update()…`)
 * ne part qu'une fois attendu — `await`, `.then()`, ou passé à `Promise.all`.
 * Écrit `void supabase.from(…).update(…)`, il ne s'envoie JAMAIS, sans erreur
 * ni trace. C'est ainsi que `profiles.last_seen_at` n'a jamais été écrit, et
 * que « Vu il y a… » ne s'affichait pour personne.
 */
describe("requêtes Supabase lancées sans être attendues", () => {
  it("aucun `void supabase…` sans `.then()` ni `.catch()`", () => {
    const fautes: string[] = [];
    for (const { file, source } of workingSources(["app/**/*.ts", "app/**/*.tsx", "components/**/*.ts", "components/**/*.tsx", "hooks/**/*.ts", "lib/**/*.ts"])) {
      if (/__tests__|\.test\./.test(file)) continue;
      for (const m of source.matchAll(/\bvoid\s+(?:supabase|client|sb)\b[^;]*;/g)) {
        // Seuls les constructeurs de requête sont paresseux (`removeChannel`, lui, part tout de suite).
        if (!/\.(?:from|rpc)\(/.test(m[0]) || /\.then\(|\.catch\(/.test(m[0])) continue;
        const ligne = source.slice(0, m.index).split("\n").length;
        fautes.push(`${file}:${ligne}`);
      }
    }
    expect(fautes).toEqual([]);
  });
});
