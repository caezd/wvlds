import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Une écriture Supabase dont on ne lit jamais l'erreur échoue en silence.
// Quand l'interface s'est déjà mise à jour de façon optimiste — ce qui est la
// règle ici — l'utilisateur voit son changement, y croit, et le perd au
// rechargement suivant. C'est ce défaut qui a laissé l'invitation par courriel
// inopérante pendant des mois sans que rien ne le signale.
//
// Ce test fige le résultat du nettoyage : toute nouvelle mutation non
// contrôlée doit être soit corrigée, soit ajoutée ci-dessous avec sa raison.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Écritures dont l'erreur est délibérément ignorée. Chaque entrée porte sa
 * justification : on ne l'allonge pas sans en écrire une.
 */
const EXCEPTIONS: { file: string; raison: string }[] = [
  {
    file: join("components", "providers", "PresenceProvider.tsx"),
    raison:
      "Battement de présence répété : un échec ponctuel se rattrape au battement " +
      "suivant, et journaliser chaque tentative noierait la console pendant une " +
      "coupure réseau. Le « vu il y a X » est purement indicatif.",
  },
];

const MUTATIONS = ["insert(", "update(", "upsert(", "delete("];

/** L'expression qui commence à `start` lit-elle son erreur ? */
function readsItsError(lines: string[], start: number): boolean {
  const block = lines.slice(start, start + 14).join("\n");
  return (
    /(const|let)\s*\{[^}]*\berror\b/.test(block) ||
    /\.then\(\s*\(\s*\{[^}]*\berror\b/.test(block) ||
    /=>\s*\{?[^;]*\berror\b/.test(block)
  );
}

function scan(): { file: string; line: number }[] {
  const files = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], {
    encoding: "utf-8",
    cwd: process.cwd(),
  })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f && !f.includes("__tests__") && !f.endsWith(".d.ts"));

  const hits: { file: string; line: number }[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(join(process.cwd(), file), "utf-8");
    } catch {
      continue;
    }
    if (!source.includes(".from(")) continue;
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (!MUTATIONS.some((m) => lines[i].includes(m))) continue;

      // Remonte au début de l'expression.
      let start = i;
      while (start > 0 && !/(await|=|return|void)\s/.test(lines[start])) start--;
      const head = lines[start].trim();
      if (!head.startsWith("await") && !head.startsWith("void")) continue;
      if (!lines.slice(start, i + 1).join("\n").includes(".from(")) continue;
      if (readsItsError(lines, start)) continue;

      // `git ls-files` rend des chemins en « / » ; on les aligne sur le
      // séparateur de la plateforme pour comparer aux EXCEPTIONS.
      hits.push({ file: file.split("/").join(sep), line: start + 1 });
    }
  }
  // Une même expression peut être repérée plusieurs fois.
  const seen = new Set<string>();
  return hits.filter((h) => {
    const k = `${h.file}:${h.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

describe("écritures Supabase dont l'erreur n'est jamais lue", () => {
  const hits = scan();

  it("repère bien les écritures (le scan n'est pas cassé)", () => {
    // Garde-fou du garde-fou : si l'extraction ne trouve plus rien du tout,
    // c'est qu'elle est cassée, pas que le code est parfait.
    expect(EXCEPTIONS.length).toBeGreaterThan(0);
    const exceptionsTrouvees = EXCEPTIONS.filter((e) =>
      hits.some((h) => h.file === e.file),
    );
    expect(
      exceptionsTrouvees.map((e) => e.file),
      "les exceptions connues devraient toujours être repérées par le scan",
    ).toEqual(EXCEPTIONS.map((e) => e.file));
  });

  it("n'en laisse aucune hors de la liste d'exceptions", () => {
    const autorisees = new Set(EXCEPTIONS.map((e) => e.file));
    const nouvelles = hits
      .filter((h) => !autorisees.has(h.file))
      .map((h) => `${h.file}:${h.line}`);
    expect(
      nouvelles,
      "écriture dont l'erreur n'est pas lue : la corriger, ou l'ajouter aux " +
        "EXCEPTIONS de ce fichier avec sa justification",
    ).toEqual([]);
  });
});
