import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Deux invariants d'internationalisation.
//
// 1. Les trois langues portent les mêmes clés. Une clé absente d'une langue
//    n'échoue pas bruyamment : next-intl retombe sur la clé brute, et
//    l'utilisateur voit `worlds.newWorld` au milieu de l'écran.
//
// 2. Aucune chaîne visible n'est écrite en dur dans le code. Six composants
//    n'avaient aucune traduction et affichaient du français à tout le monde ;
//    127 chaînes ont été reprises. Sans garde-fou, elles reviennent une par
//    une.
//
// Le second test tolère une liste d'exceptions explicites — pas un seuil
// numérique, qui laisserait passer n'importe quel ajout tant qu'il reste sous
// la barre.
// ──────────────────────────────────────────────────────────────────────────

const LANGUES = ["fr", "en", "es"] as const;

/** Chemins de clés d'un fichier de messages, aplatis. */
function cles(langue: string): Set<string> {
  const brut = JSON.parse(
    readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf-8"),
  ) as Record<string, unknown>;
  const out = new Set<string>();
  const parcourir = (obj: Record<string, unknown>, prefixe: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const chemin = prefixe ? `${prefixe}.${k}` : k;
      if (v && typeof v === "object") parcourir(v as Record<string, unknown>, chemin);
      else out.add(chemin);
    }
  };
  parcourir(brut, "");
  return out;
}

/**
 * Fichiers dont les chaînes françaises sont assumées.
 *
 * `app/legal` porte les mentions légales et la politique de confidentialité.
 * Les traduire mécaniquement serait irresponsable : un contresens y a des
 * conséquences juridiques, et le texte vise une juridiction francophone. Leur
 * traduction relève d'une relecture humaine, pas d'un passage automatique.
 */
const EXCEPTIONS = [join("app", "legal")];

const MOTS_FR =
  /[àâäçéèêëîïôöûùüÿœ]|(?<![A-Za-z])(?:le|la|les|un|une|des|du|de|au|aux|ce|cette|vous|votre|vos|est|sont|pas|plus|avec|pour|sans|dans|sur|par|que|qui|aucun|aucune|impossible|erreur|nouveau|nouvelle|supprimer|ajouter|modifier|enregistrer|annuler|monde|salon|membre|personnage)(?![A-Za-z])/i;

function estVisible(t: string): boolean {
  const s = t.trim();
  if (s.length < 4 || !MOTS_FR.test(s)) return false;
  if (/^[\w./:@-]+$/.test(s)) return false;
  if (/^(https?:|\/|#|data:)/.test(s)) return false;
  return true;
}

function chainesEnDur(): string[] {
  const fichiers = execFileSync("git", ["ls-files", "*.tsx", "*.ts"], {
    encoding: "utf-8",
    cwd: process.cwd(),
  })
    .split("\n")
    .map((f) => f.trim())
    .filter(
      (f) =>
        f &&
        !f.includes("__tests__") &&
        !f.startsWith("e2e/") &&
        !f.startsWith("migrations/") &&
        f !== "lib/changelog.ts",
    );

  const trouvees: string[] = [];
  for (const fichier of fichiers) {
    const chemin = fichier.split("/").join(sep);
    if (EXCEPTIONS.some((e) => chemin.startsWith(e))) continue;

    const lignes = readFileSync(join(process.cwd(), fichier), "utf-8").split("\n");
    lignes.forEach((ligne, i) => {
      const nu = ligne.trim();
      if (nu.startsWith("*") || nu.startsWith("//")) return;
      const code = ligne.split("//")[0];

      const candidats: string[] = [];
      for (const m of code.matchAll(/>([^<>{}\n]{4,})</g)) candidats.push(m[1]);
      for (const m of code.matchAll(
        /(?:placeholder|aria-label|title|alt|label)=\{?"([^"]{4,})"/g,
      ))
        candidats.push(m[1]);
      for (const m of code.matchAll(
        /toast\.(?:error|success|info|warning)\(\s*"([^"]{4,})"/g,
      ))
        candidats.push(m[1]);

      for (const c of candidats) {
        if (estVisible(c)) trouvees.push(`${chemin}:${i + 1}  ${c.trim().slice(0, 60)}`);
      }
    });
  }
  return trouvees;
}

describe("internationalisation", () => {
  it("les trois langues portent exactement les mêmes clés", () => {
    const [fr, en, es] = LANGUES.map(cles);
    expect(fr.size).toBeGreaterThan(500); // garde-fou du garde-fou

    const manquantesEn = [...fr].filter((k) => !en.has(k)).sort();
    const manquantesEs = [...fr].filter((k) => !es.has(k)).sort();
    const enTrop = [...new Set([...en, ...es])].filter((k) => !fr.has(k)).sort();

    expect(manquantesEn, "clés absentes de en.json").toEqual([]);
    expect(manquantesEs, "clés absentes de es.json").toEqual([]);
    expect(enTrop, "clés présentes en en/es mais pas en fr").toEqual([]);
  });

  it("aucune chaîne visible n'est écrite en dur", () => {
    expect(
      chainesEnDur(),
      "chaîne visible en dur : la déplacer dans messages/*.json, ou ajouter " +
        "son fichier aux EXCEPTIONS de ce test avec sa justification",
    ).toEqual([]);
  });
});
