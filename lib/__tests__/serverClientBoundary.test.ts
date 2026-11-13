import { existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

import { readTracked, trackedSources } from "@/test/sourceFiles";

// Un module « use client » n'exporte, vu du serveur, que des références :
// on peut RENDRE un composant qu'il exporte, ou passer une de ses valeurs en
// prop à un composant client, mais pas l'APPELER. `loadBirthdayMembers()`,
// importée du bloc « Anniversaires » par la page d'un monde, levait ainsi à
// chaque rendu d'un monde dont l'accueil affiche ce bloc — sans qu'aucun test
// unitaire ne le voie, puisque sous Vitest la directive n'a aucun effet.
//
// Règle vérifiée : un fichier serveur de `app/` (sans « use client ») n'importe
// d'un module client que des types ou des composants (nom en majuscule). Une
// fonction, une constante, un utilitaire doit vivre dans un module neutre.

const CLIENT_DIRECTIVE = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;

function isClientModule(source: string): boolean {
  return CLIENT_DIRECTIVE.test(source);
}

/** Chemin d'un import, tel que le dépôt le range — `null` hors du dépôt. */
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = normalize(join(dirname(fromFile), spec)).replace(/\\/g, "/");
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (/\.(ts|tsx)$/.test(candidate) && existsSync(join(process.cwd(), candidate))) return candidate;
  }
  return null;
}

/** Les noms importés en valeur (pas `type`) par chaque `import … from`. */
function valueImports(source: string): { spec: string; names: string[] }[] {
  const out: { spec: string; names: string[] }[] = [];
  const re = /^import\s+(?!type\s)([\s\S]*?)\s+from\s+["']([^"']+)["']/gm;
  for (const m of source.matchAll(re)) {
    const clause = m[1];
    const names: string[] = [];
    const named = clause.match(/\{([\s\S]*)\}/);
    if (named) {
      for (const part of named[1].split(",")) {
        const p = part.trim();
        if (!p || p.startsWith("type ")) continue;
        names.push(p.split(/\s+as\s+/).pop()!.trim());
      }
    }
    const def = clause.replace(/\{[\s\S]*\}/, "").replace(/,/g, " ").trim();
    if (def && !def.startsWith("*")) names.push(def);
    if (names.length) out.push({ spec: m[2], names });
  }
  return out;
}

/** Les imports d'un fichier serveur qui appelleraient un module client. */
export function clientCallsFromServer(file: string, source: string, read: (f: string) => string | null): string[] {
  if (isClientModule(source)) return [];
  const problems: string[] = [];
  for (const { spec, names } of valueImports(source)) {
    const target = resolveImport(file, spec);
    if (!target) continue;
    const targetSource = read(target);
    if (!targetSource || !isClientModule(targetSource)) continue;
    for (const name of names) {
      if (/^[a-z_$]/.test(name)) problems.push(`${file} : « ${name} » vient du module client ${target}`);
    }
  }
  return problems;
}

describe("frontière serveur / client", () => {
  it("un fichier serveur de app/ n'importe d'un module client que des composants ou des types", () => {
    const problems = trackedSources(["app/**/*.ts", "app/**/*.tsx"])
      .filter(({ file }) => !file.includes("__tests__"))
      .flatMap(({ file, source }) => clientCallsFromServer(file, source, readTracked));
    expect(problems).toEqual([]);
  });

  it("repère une fonction importée d'un module client, pas le composant", () => {
    // `resolveImport` lit le disque : on vise un module client réel du dépôt.
    const real =
      'import { upcomingBirthdays, WorldBirthdaysWidget } from "@/components/worlds/home/widgets/WorldBirthdaysWidget";\n';
    expect(clientCallsFromServer("app/page.tsx", real, readTracked)).toEqual([
      "app/page.tsx : « upcomingBirthdays » vient du module client components/worlds/home/widgets/WorldBirthdaysWidget.tsx",
    ]);
  });

  it("ignore un fichier lui-même client, et les imports de types", () => {
    const real = 'import { type BirthdayMember, upcomingBirthdays } from "@/components/worlds/home/widgets/WorldBirthdaysWidget";\n';
    expect(clientCallsFromServer("app/x.tsx", `"use client";\n${real}`, readTracked)).toEqual([]);
    const typeOnly = 'import type { Foo } from "@/components/worlds/home/widgets/WorldBirthdaysWidget";\n';
    expect(clientCallsFromServer("app/x.tsx", typeOnly, readTracked)).toEqual([]);
  });
});
