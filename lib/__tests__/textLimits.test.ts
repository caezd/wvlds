import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DB_TEXT_LIMITS } from "@/lib/textLimits";

// ──────────────────────────────────────────────────────────────────────────
// `lib/textLimits.ts` n'est qu'un miroir : les migrations font foi. Ce test
// refuse toute divergence — une contrainte ajoutée en base sans être reportée
// dans le code, ou l'inverse.
//
// Il lit les `CHECK (char_length(col) <= N)` de toutes les migrations, en
// tenant compte des suppressions (`DROP CONSTRAINT`) : une borne retirée plus
// tard ne doit plus figurer dans le miroir.
// ──────────────────────────────────────────────────────────────────────────

const MIGRATIONS = join(process.cwd(), "migrations");

/** Bornes déclarées par l'ensemble des migrations, dans leur ordre d'application. */
function limitsFromMigrations(): Map<string, number> {
  const limites = new Map<string, number>();
  const parNom = new Map<string, string>(); // nom de contrainte → "table.colonne"

  const fichiers = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // les migrations sont préfixées par leur numéro

  for (const fichier of fichiers) {
    const sql = readFileSync(join(MIGRATIONS, fichier), "utf-8")
      // Les en-têtes commentés décrivent souvent les contraintes : les ignorer.
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");

    const ajout =
      /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+CONSTRAINT\s+(\w+)\s+CHECK\s*\(\s*char_length\(\s*(\w+)\s*\)\s*<=\s*(\d+)/gi;
    for (const m of sql.matchAll(ajout)) {
      const cle = `${m[1]}.${m[3]}`;
      limites.set(cle, Number(m[4]));
      parNom.set(m[2], cle);
    }

    const retrait = /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?(\w+)/gi;
    for (const m of sql.matchAll(retrait)) {
      const cle = parNom.get(m[2]);
      if (cle) limites.delete(cle);
    }
  }
  return limites;
}

/**
 * Contraintes appliquées avant l'existence du dossier `migrations/`, ou dont
 * la forme SQL diffère (borne haute ET basse dans le même CHECK). Leur valeur
 * a été relevée directement en base ; elles ne sont donc pas rejouables par
 * l'analyse des fichiers.
 */
const HORS_MIGRATIONS: Record<string, string> = {
  "dm_messages.content": "CHECK (length(trim(content)) > 0 AND length(content) <= 4000)",
  "personas.name": "CHECK (char_length(name) >= 1 AND char_length(name) <= 40)",
};

describe("bornes de longueur : code et migrations en phase", () => {
  const desMigrations = limitsFromMigrations();

  it("l'extraction des migrations fonctionne", () => {
    // Garde-fou du garde-fou : sans lui, une regex cassée ferait passer le
    // test suivant en comparant deux ensembles vides.
    expect(desMigrations.size).toBeGreaterThanOrEqual(30);
  });

  it("aucune borne déclarée en base ne manque au miroir", () => {
    const manquantes = [...desMigrations.entries()]
      .filter(([col]) => !(col in DB_TEXT_LIMITS))
      .map(([col, n]) => `${col} (${n})`);
    expect(
      manquantes,
      "contrainte présente dans les migrations mais absente de lib/textLimits.ts",
    ).toEqual([]);
  });

  it("les valeurs concordent", () => {
    const ecarts = [...desMigrations.entries()]
      .filter(([col, n]) => col in DB_TEXT_LIMITS && (DB_TEXT_LIMITS as Record<string, number>)[col] !== n)
      .map(([col, n]) => `${col} : migrations ${n}, code ${(DB_TEXT_LIMITS as Record<string, number>)[col]}`);
    expect(ecarts, "divergence entre les migrations et lib/textLimits.ts").toEqual([]);
  });
  it("aucune entrée du miroir n'est inventée", () => {
    // Sens inverse du test précédent : une borne écrite dans le code sans
    // exister en base donnerait une fausse assurance. C'est exactement l'erreur
    // qui s'est produite ici — `personas.bio` figurait au miroir à 500 alors
    // qu'aucune contrainte ne la bornait.
    const inventees = Object.keys(DB_TEXT_LIMITS).filter(
      (col) => !desMigrations.has(col) && !(col in HORS_MIGRATIONS),
    );
    expect(
      inventees,
      "borne présente dans lib/textLimits.ts sans migration correspondante : " +
        "ajouter la migration, ou l'inscrire dans HORS_MIGRATIONS avec sa définition réelle",
    ).toEqual([]);
  });
});
