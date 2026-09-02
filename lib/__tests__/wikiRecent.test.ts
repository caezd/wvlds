import { describe, it, expect } from "vitest";

import { recentPages, type DatedPage } from "@/lib/wikiRecent";

function page(p: Partial<DatedPage> & { id: string }): DatedPage {
  return { is_folder: false, draft_updated_at: null, published_at: null, ...p };
}

const PAGES = [
  page({ id: "vieille", published_at: "2026-08-01T00:00:00Z" }),
  page({ id: "brouillon", published_at: "2026-08-10T00:00:00Z", draft_updated_at: "2026-09-01T00:00:00Z" }),
  page({ id: "fraiche", published_at: "2026-08-20T00:00:00Z" }),
  page({ id: "dossier", is_folder: true, published_at: "2026-09-02T00:00:00Z" }),
  page({ id: "vide" }),
  page({ id: "jamais-publiee", draft_updated_at: "2026-08-15T00:00:00Z" }),
];

describe("recentPages", () => {
  it("classe de la plus récente à la plus ancienne", () => {
    expect(recentPages(PAGES, false).map(e => e.page.id)).toEqual([
      "fraiche", "brouillon", "vieille",
    ]);
  });

  it("ne montre à un lecteur que ce qui est publié", () => {
    // La RLS lui cache déjà les brouillons ; lui en montrer la date
    // annoncerait un changement qu'il ne peut pas lire.
    const ids = recentPages(PAGES, false).map(e => e.page.id);
    expect(ids).not.toContain("jamais-publiee");
    expect(recentPages(PAGES, false).find(e => e.page.id === "brouillon")?.at)
      .toBe("2026-08-10T00:00:00Z");
  });

  it("montre à un éditeur la dernière touche, publiée ou non", () => {
    const entries = recentPages(PAGES, true);
    expect(entries.map(e => e.page.id)).toEqual([
      "brouillon", "fraiche", "jamais-publiee", "vieille",
    ]);
    expect(entries[0].hasNewerDraft).toBe(true);
    expect(entries[1].hasNewerDraft).toBe(false);
  });

  it("signale un brouillon jamais publié comme en attente", () => {
    expect(recentPages(PAGES, true).find(e => e.page.id === "jamais-publiee")?.hasNewerDraft)
      .toBe(true);
  });

  it("écarte les dossiers et les pages sans date", () => {
    const ids = recentPages(PAGES, true).map(e => e.page.id);
    expect(ids).not.toContain("dossier");
    expect(ids).not.toContain("vide");
  });
});
