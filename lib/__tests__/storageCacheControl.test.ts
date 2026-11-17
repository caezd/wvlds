import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Chaque envoi de fichier fixe sa durée de cache (STORAGE_CACHE_CONTROL).
//
// Sans l'option, Supabase sert le fichier avec `max-age=3600` : le navigateur
// et le CDN le redemandent à l'origine au bout d'une heure, environ 0,8 s par
// image. Ce test échoue dès qu'un nouvel `.upload(` l'oublie.
// ──────────────────────────────────────────────────────────────────────────

const RACINES = ["app", "components", "lib", "hooks"];

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === "__tests__" || nom === "node_modules" ? [] : fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}

describe("cache des fichiers envoyés", () => {
  const appels = RACINES.flatMap((r) => fichiers(join(process.cwd(), r))).flatMap((f) => {
    const lignes = readFileSync(f, "utf-8").split("\n");
    return lignes.flatMap((ligne, i) => (ligne.includes(".upload(") ? [{ f, i, ligne }] : []));
  });

  it("trouve bien des envois", () => {
    // Garde-fou du garde-fou : un test qui ne trouve rien passerait toujours.
    expect(appels.length).toBeGreaterThan(10);
  });

  it("chaque `.upload(` passe `cacheControl: STORAGE_CACHE_CONTROL`", () => {
    const oublis = appels
      .filter(({ ligne }) => !ligne.includes("cacheControl: STORAGE_CACHE_CONTROL"))
      .map(({ f, i }) => `${f.replace(process.cwd() + "/", "")}:${i + 1}`);
    expect(oublis, "envoi sans durée de cache d'un an").toEqual([]);
  });
});
