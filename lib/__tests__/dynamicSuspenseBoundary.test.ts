import { describe, it, expect } from "vitest";

import { workingSources } from "@/test/sourceFiles";

/**
 * `next/dynamic` ne pose de frontière Suspense que si l'appel donne un
 * `loading` ou `ssr: false` (cf. next/dist/shared/lib/lazy-dynamic/loadable.js).
 * Sans elle, un composant chargé à la demande qui apparaît après un clic —
 * une fiche, un dialogue — suspend jusqu'au `loading.tsx` de la route : toute
 * l'application disparaît, noire, le temps de télécharger son code, puis
 * revient. C'est ce que faisait la fiche d'un joueur à sa première ouverture
 * sur le site en ligne.
 *
 * Seules exceptions : les vues que l'on n'atteint que par une navigation (une
 * transition, qui garde l'ancienne vue à l'écran pendant le chargement).
 */
const NAVIGATION_ONLY: Record<string, string[]> = {
  // Onglets de l'accueil du monde, changés par `router.replace(?view=…)`.
  "components/worlds/home/WorldHome.tsx": [
    "WorldWiki",
    "WorldSettingsView",
    "RelationsCanvas",
    "WorldMap",
    "WorldTimeline",
    "WorldShops",
    "WorldMembersPanel",
    "WorldPersonasPanel",
    "WorldStatsWidget",
  ],
};

/** Le texte de l'appel `dynamic(…)` qui commence à `start` (parenthèse ouvrante comprise). */
function callText(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")" && --depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

describe("composants chargés à la demande (next/dynamic)", () => {
  it("chacun a sa propre frontière Suspense : `loading` ou `ssr: false`", () => {
    const fautes: string[] = [];
    for (const { file, source } of workingSources(["app/**/*.tsx", "components/**/*.tsx"])) {
      if (/__tests__|\.test\./.test(file)) continue;
      for (const m of source.matchAll(/const\s+(\w+)\s*=\s*dynamic\s*(?=\()/g)) {
        const call = callText(source, m.index! + m[0].length);
        if (/\bloading\s*:/.test(call) || /\bssr\s*:\s*false\b/.test(call)) continue;
        if (NAVIGATION_ONLY[file]?.includes(m[1])) continue;
        fautes.push(`${file} : ${m[1]}`);
      }
    }
    expect(fautes).toEqual([]);
  });
});
