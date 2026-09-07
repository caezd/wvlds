// Les fichiers du dépôt, tels que les contrôles de source les lisent.
//
// Plusieurs tests parcourent le code pour y chercher un motif — une chaîne
// écrite en dur, un bouton sans nom, une écriture Supabase dont personne ne
// lit l'erreur. Tous partaient de `git ls-files`, et deux d'entre eux
// lisaient ensuite le fichier sans filet.
//
// Or `git ls-files` rend ce que l'INDEX contient, pas ce qui est sur le
// disque : un fichier supprimé mais pas encore indexé y figure toujours. Le
// lire lève alors `ENOENT`, et la suite entière tombe — un contrôle qui ne
// dit plus rien de ce qu'il surveille, pour une raison qui ne le regarde pas.
//
// Un fichier absent du disque n'a pas de source à examiner : on passe.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Les fichiers suivis par git qui correspondent à ces motifs. */
export function trackedFiles(patterns: string[]): string[] {
  return execFileSync("git", ["ls-files", ...patterns], {
    encoding: "utf-8",
    cwd: process.cwd(),
  })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
}

/** Le contenu d'un fichier suivi — `null` s'il n'est plus sur le disque. */
export function readTracked(file: string): string | null {
  try {
    return readFileSync(join(process.cwd(), file), "utf-8");
  } catch {
    return null;
  }
}

/** Les fichiers suivis, avec leur source, ceux qui ont disparu en moins. */
export function trackedSources(patterns: string[]): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  for (const file of trackedFiles(patterns)) {
    const source = readTracked(file);
    if (source !== null) out.push({ file, source });
  }
  return out;
}
