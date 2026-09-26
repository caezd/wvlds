import { describe, it, expect } from "vitest";

import { trackedSources, readTracked } from "@/test/sourceFiles";

// ──────────────────────────────────────────────────────────────────────────
// Un composant serveur n'appelle pas une fonction d'un module « use client ».
//
// L'accueil d'un monde (`app/(protected)/w/[id]/WorldHomeContent.tsx`) est
// rendu sur le serveur et prépare les données de ses blocs. Deux de ces
// lectures — les anniversaires, les cartes — étaient exportées depuis le
// fichier du bloc, marqué « use client ». Next y remplace chaque export par
// une référence client : l'appel lève, à l'exécution seulement,
//
//   Attempted to call loadBirthdayMembers() from the server but
//   loadBirthdayMembers is on the client.
//
// Aucun test unitaire ne le voyait — ils importent les deux côtés dans le même
// environnement — et `tsc` non plus, le type étant le bon. Seul un monde dont
// la grille portait le bloc des anniversaires plantait, entièrement.
//
// Ce contrôle relit les imports de valeurs d'un composant serveur et refuse
// ceux qui visent un module client. Les imports de types (`import type`, ou
// `type X` dans les accolades) sont effacés à la compilation : ils passent.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Ce qu'un fichier importe pour la VALEUR, par module : le nom local de chaque
 * liaison. Les imports de types (`import type`, ou `type X` dans les
 * accolades) sont effacés à la compilation et ne comptent pas.
 */
function valueImports(source: string): { from: string; names: string[] }[] {
  const out: { from: string; names: string[] }[] = [];
  const re = /import\s+([^;]*?)\s+from\s+"(@\/[^"]+|\.[^"]+)"/g;
  for (const [, clause, from] of source.matchAll(re)) {
    if (/^type\s/.test(clause)) continue;
    const names: string[] = [];
    // `import Defaut, { a, b as c }` — on retient le nom local de chacun.
    const avant = clause.split("{")[0].replace(/,\s*$/, "").trim();
    if (avant && !avant.startsWith("*")) names.push(avant);
    const accolade = clause.match(/\{([^}]*)\}/);
    if (accolade) {
      for (const brut of accolade[1].split(",")) {
        const nom = brut.trim();
        if (!nom || nom.startsWith("type ")) continue;
        names.push((nom.split(/\s+as\s+/).pop() ?? nom).trim());
      }
    }
    if (names.length > 0) out.push({ from, names });
  }
  return out;
}

/** Le fichier que vise un import, avec son extension. */
function resolve(chemin: string, depuis: string): string | null {
  const base = chemin.startsWith("@/")
    ? chemin.slice(2)
    : new URL(chemin, `file:///${depuis.split("/").slice(0, -1).join("/")}/`).pathname.slice(1);
  for (const suffixe of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const essai = `${base}${suffixe}`;
    if (readTracked(essai) !== null) return essai;
  }
  return null;
}

/** Un composant se rend et traverse la frontière ; une fonction s'appelle. */
function estComposant(nom: string): boolean {
  return /^[A-Z]/.test(nom);
}

describe("frontière serveur / client", () => {
  it("aucun composant serveur n'appelle une fonction d'un module « use client »", () => {
    const fautes: string[] = [];
    for (const { file, source } of trackedSources(["app/**/*.tsx", "app/**/*.ts"])) {
      // Un fichier client a le droit : il est du même côté.
      if (/^["']use client["']/.test(source.trimStart())) continue;
      for (const { from, names } of valueImports(source)) {
        // Rendre un composant client depuis le serveur est le fonctionnement
        // normal ; seules les autres liaisons posent problème.
        const appelees = names.filter((n) => !estComposant(n));
        if (appelees.length === 0) continue;
        const cible = resolve(from, file);
        const cibleSource = cible ? readTracked(cible) : null;
        if (cibleSource && /^["']use client["']/.test(cibleSource.trimStart())) {
          fautes.push(`${file} → ${from} (${appelees.join(", ")})`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });

  it("les lectures partagées avec le serveur vivent hors d'un module client", () => {
    // `widgetData.ts` est ce module : il n'a pas de directive, il se compile
    // des deux côtés. Les blocs le réexportent pour leurs propres appelants.
    const partage = readTracked("components/worlds/home/widgets/widgetData.ts");
    expect(partage).not.toBeNull();
    expect(partage!.trimStart().startsWith('"use client"')).toBe(false);

    const rsc = readTracked("app/(protected)/w/[id]/WorldHomeContent.tsx")!;
    for (const chargeur of ["loadBirthdayMembers", "loadMapWidgetData"]) {
      expect(rsc).toContain(chargeur);
    }
    expect(rsc).toContain('from "@/components/worlds/home/widgets/widgetData"');
  });
});
