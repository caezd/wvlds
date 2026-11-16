import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Une seule copie des couches internes de Radix.
//
// Un Dialog et un Popover (ou Select, menu…) ne s'entendent que s'ils
// partagent le même module `react-dismissable-layer` / `react-focus-scope` :
// la pile des couches et le piège de focus vivent dans une variable de module.
// Avec deux copies, le modal ne reconnaît pas le menu ouvert par-dessus lui :
// il coupe ses clics (`pointer-events: none` sur le body), lui reprend le focus
// et bloque sa molette. C'est ce qui rendait inutilisables les choix d'icône
// et d'emoji de l'encadré. `pnpm dedupe` après chaque mise à jour de Radix.
// ──────────────────────────────────────────────────────────────────────────

const SHARED = [
  "react-dismissable-layer",
  "react-focus-scope",
  "react-focus-guards",
  "react-portal",
  "react-popper",
  "react-presence",
  "react-dialog",
];

describe("Radix", () => {
  const lock = readFileSync(join(process.cwd(), "pnpm-lock.yaml"), "utf-8");

  it.each(SHARED)("une seule version de @radix-ui/%s dans le lockfile", (name) => {
    const versions = new Set(
      [...lock.matchAll(new RegExp(`^  '@radix-ui/${name}@([^(':]+)`, "gm"))].map((m) => m[1]),
    );
    expect(versions.size, `versions en double : ${[...versions].join(", ")} — lancer \`pnpm dedupe\``).toBe(1);
  });
});
