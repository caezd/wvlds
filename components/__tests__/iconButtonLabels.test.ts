import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Un bouton dont le seul contenu est une icône n'a aucun nom accessible : un
// lecteur d'écran annonce « bouton », rien de plus. 40 d'entre eux étaient
// dans ce cas.
//
// Ce test garde deux invariants, et les deux ont attrapé une erreur réelle
// pendant la correction :
//   1. aucun bouton à icône seule sans `aria-label` (ni `title`) ;
//   2. aucun attribut `aria-label` posé HORS d'une balise — un attribut écrit
//      juste après le `>` devient du texte JSX et s'affiche à l'écran. C'est
//      arrivé neuf fois, et `tsc` ne le voit pas : c'est du JSX valide.
// ──────────────────────────────────────────────────────────────────────────

/** Index du `>` fermant la balise ouverte en `i`, accolades et chaînes ignorées. */
function finDeBalise(s: string, i: number): number {
  let prof = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "{") prof++;
    else if (c === "}") prof--;
    else if ((c === '"' || c === "'") && prof === 0) {
      const q = c;
      j++;
      while (j < s.length && s[j] !== q) j++;
    } else if (c === "/" && s[j + 1] === "/" && prof === 0) {
      // Commentaire de ligne dans une balise multiligne : le `>` éventuel
      // qu'il contient n'est pas celui de la balise.
      while (j < s.length && s[j] !== "\n") j++;
    } else if (c === ">" && prof === 0) return j;
  }
  return -1;
}

function fichiers(): string[] {
  return execFileSync("git", ["ls-files", "*.tsx"], { encoding: "utf-8", cwd: process.cwd() })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f && !f.includes("__tests__"));
}

const sources = fichiers().map((f) => ({
  chemin: f.split("/").join(sep),
  source: readFileSync(join(process.cwd(), f), "utf-8"),
}));

describe("boutons à icône seule", () => {
  it("portent tous un nom accessible", () => {
    const nus: string[] = [];
    for (const { chemin, source } of sources) {
      const lucide = new Set<string>();
      for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)) {
        for (const x of m[1].split(",")) {
          const n = x.trim().split(" as ").pop();
          if (n) lucide.add(n);
        }
      }
      if (lucide.size === 0) continue;

      for (const m of source.matchAll(/<button\b/g)) {
        const debut = m.index! + m[0].length;
        const fin = finDeBalise(source, debut);
        if (fin === -1) continue;
        const attrs = source.slice(debut, fin);
        if (/aria-label|aria-labelledby|title=/.test(attrs)) continue;
        const close = source.indexOf("</button>", fin);
        if (close === -1) continue;

        let reste = source.slice(fin + 1, close);
        let auMoinsUneIcone = false;
        for (const im of reste.matchAll(/<([A-Z][A-Za-z0-9]*)\b[^>]*\/>/g)) {
          if (lucide.has(im[1])) {
            auMoinsUneIcone = true;
            reste = reste.replace(im[0], "");
          }
        }
        if (!auMoinsUneIcone || reste.trim()) continue;
        nus.push(`${chemin}:${source.slice(0, m.index!).split("\n").length}`);
      }
    }
    expect(
      nus,
      "bouton dont le seul contenu est une icône : lui donner un `aria-label`",
    ).toEqual([]);
  });

  it("n'ont pas d'attribut `aria-label` échoué hors de sa balise", () => {
    const orphelins: string[] = [];
    for (const { chemin, source } of sources) {
      if (!source.includes("aria-label")) continue;
      const balises: [number, number][] = [];
      for (const m of source.matchAll(/<[A-Za-z][\w.]*\b/g)) {
        const fin = finDeBalise(source, m.index! + m[0].length);
        if (fin !== -1) balises.push([m.index!, fin]);
      }
      for (const m of source.matchAll(/aria-label=/g)) {
        const dans = balises.some(([a, b]) => a < m.index! && m.index! < b);
        if (!dans) orphelins.push(`${chemin}:${source.slice(0, m.index!).split("\n").length}`);
      }
    }
    expect(
      orphelins,
      "`aria-label` hors d'une balise : il s'afficherait comme du texte",
    ).toEqual([]);
  });
});
