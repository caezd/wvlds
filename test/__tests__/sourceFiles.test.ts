import { describe, it, expect } from "vitest";

import { readTracked, trackedFiles, trackedSources } from "@/test/sourceFiles";

// ──────────────────────────────────────────────────────────────────────────
// `git ls-files` rend ce que l'INDEX contient, pas ce que le disque porte :
// un fichier supprimé mais pas encore indexé y figure toujours. Trois
// contrôles de source le lisaient sans filet, et tombaient sur `ENOENT` — un
// contrôle qui ne dit plus rien de ce qu'il surveille, pour une raison qui ne
// le regarde pas.
// ──────────────────────────────────────────────────────────────────────────

describe("les fichiers que parcourent les contrôles de source", () => {
  it("rend les fichiers suivis par git", () => {
    const fichiers = trackedFiles(["*.ts"]);

    expect(fichiers.length).toBeGreaterThan(50);
    // Un fichier suivi de longue date : celui-ci vient d'être écrit et ne
    // sera dans l'index qu'au prochain commit.
    expect(fichiers).toContain("test/supabaseMock.ts");
    // Des chemins en « / », jamais de ligne vide.
    expect(fichiers.every((f) => f.trim() === f && f.length > 0)).toBe(true);
  });

  it("ne rend rien d'un fichier absent du disque, au lieu de lever", () => {
    expect(readTracked("un/fichier/qui/n/existe/pas.ts")).toBeNull();
  });

  it("écarte des sources ceux que le disque n'a plus", () => {
    // Le cas réel : une suppression pas encore indexée. La liste reste
    // lisible, et la source n'est jamais absente.
    const sources = trackedSources(["*.ts"]);

    expect(sources.length).toBeGreaterThan(50);
    expect(sources.every((s) => typeof s.source === "string")).toBe(true);
    expect(sources.length).toBeLessThanOrEqual(trackedFiles(["*.ts"]).length);
  });
});
