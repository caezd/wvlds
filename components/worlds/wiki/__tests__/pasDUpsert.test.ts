import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ──────────────────────────────────────────────────────────────────────────
// Aucun `upsert` sur les tables du wiki.
//
// PostgREST traduit un upsert en `INSERT … ON CONFLICT`. La RLS évalue donc la
// policy d'INSERT — et sur un payload partiel, les colonnes absentes valent
// NULL. Toutes les tables du wiki font porter leur vérification d'écriture sur
// `world_id` ou `page_id` : un `upsert([{ id, sort_index }])` échoue par
// conséquent pour TOUT LE MONDE, propriétaire compris, avec
//
//   new row violates row-level security policy for table "world_wiki_pages"
//
// Réordonner une page du wiki a été impossible pendant des mois pour cette
// raison, signalé à l'usage le 2026-08-31. Un `update` par ligne ne touche
// qu'aux colonnes visées et laisse les autres — donc la clé de la policy — en
// place.
// ──────────────────────────────────────────────────────────────────────────

const DOSSIER = join(process.cwd(), "components", "worlds", "wiki");

function fichiersDuWiki(): string[] {
  return readdirSync(DOSSIER, { withFileTypes: true })
    .filter(e => e.isFile() && (e.name.endsWith(".tsx") || e.name.endsWith(".ts")))
    .map(e => join(DOSSIER, e.name));
}

describe("écritures du wiki", () => {
  it("trouve bien des fichiers à analyser", () => {
    expect(fichiersDuWiki().length).toBeGreaterThan(8);
  });

  it("n'emploie nulle part `upsert`", () => {
    const fautifs = fichiersDuWiki()
      .filter(f => /\.upsert\s*\(/.test(readFileSync(f, "utf-8")))
      .map(f => f.slice(process.cwd().length + 1));

    expect(
      fautifs,
      "un upsert passe par la policy d'INSERT, où les colonnes absentes du " +
        "payload valent NULL — la vérification sur `world_id` échoue alors " +
        "pour tout le monde. Employer un `update` par ligne.",
    ).toEqual([]);
  });
});
