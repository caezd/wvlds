import { describe, it, expect } from "vitest";

import { apercuDeLaPage, type PageApercevable } from "@/lib/wikiApercu";

function page(p: Partial<PageApercevable> & { slug: string }): PageApercevable {
  return {
    title: p.slug,
    icon: null,
    description: null,
    banner_url: null,
    is_folder: false,
    ...p,
  };
}

const PAGES = [
  page({ slug: "arkham", title: "Arkham", description: "Une ville du Massachusetts." }),
  page({ slug: "asile", title: "Asile", banner_url: "https://x.test/asile.webp" }),
  page({ slug: "nue", title: "Page nue" }),
  page({ slug: "blancs", title: "Chapeau blanc", description: "   " }),
  page({ slug: "lieux", title: "Lieux", description: "Un dossier.", is_folder: true }),
];

describe("apercuDeLaPage", () => {
  it("rend le chapeau de la page visée", () => {
    expect(apercuDeLaPage(PAGES, "arkham")).toEqual({
      title: "Arkham",
      icon: null,
      description: "Une ville du Massachusetts.",
      bannerUrl: null,
    });
  });

  it("suffit d'une bannière, sans chapeau", () => {
    expect(apercuDeLaPage(PAGES, "asile")?.bannerUrl).toBe("https://x.test/asile.webp");
  });

  it("ne montre rien d'une page qui n'a rien à montrer", () => {
    // La carte ne dirait que le titre, c'est-à-dire le texte du lien qu'on est
    // en train de survoler : une fenêtre qui s'ouvre pour ne rien apprendre
    // vaut moins que pas de fenêtre.
    expect(apercuDeLaPage(PAGES, "nue")).toBeNull();
  });

  it("ne prend pas des espaces pour un chapeau", () => {
    expect(apercuDeLaPage(PAGES, "blancs")).toBeNull();
  });

  it("ignore les dossiers, où aucun lien ne mène", () => {
    expect(apercuDeLaPage(PAGES, "lieux")).toBeNull();
  });

  it("ne montre rien d'une page introuvable", () => {
    // Le lien est déjà rendu comme cassé : une carte vide n'ajouterait qu'une
    // hésitation.
    expect(apercuDeLaPage(PAGES, "fantome")).toBeNull();
  });
});
