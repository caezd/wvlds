import { describe, it, expect } from "vitest";

import { searchWiki, type SearchableNote, type SearchablePage } from "@/lib/wikiSearch";

const PAGES: SearchablePage[] = [
  { id: "p1", title: "Le Hub central", content: "Le cœur administratif.", is_folder: false },
  { id: "p2", title: "Arkham", content: "Une ville portuaire.", is_folder: false },
  { id: "d1", title: "Lieux", content: null, is_folder: true },
];

const NOTES: SearchableNote[] = [
  { id: "n1", page_id: "p1", title: "Clé rouillée", body: "Trouvée sous une dalle." },
  { id: "n2", page_id: "p2", title: "Rumeurs", body: "On parle d'une clé au fond du port." },
];

describe("searchWiki", () => {
  it("trouve une fiche par son titre, et dit de quelle page elle vient", () => {
    // Tout ce qu'on range dans la colonne de droite était introuvable : une
    // note qu'on ne retrouve pas est une note perdue.
    expect(searchWiki(PAGES, NOTES, "rouillée")).toEqual([
      { pageId: "p1", note: { id: "n1", title: "Clé rouillée" }, excerpt: "" },
    ]);
  });

  it("trouve une fiche par son corps, avec l'extrait autour du terme", () => {
    const [hit] = searchWiki(PAGES, NOTES, "fond du port");
    expect(hit.note?.title).toBe("Rumeurs");
    expect(hit.excerpt).toContain("fond du port");
  });

  it("place les titres devant les corps", () => {
    // Qui tape « clé » cherche plus probablement la fiche qui s'appelle ainsi
    // que le paragraphe qui en parle.
    expect(searchWiki(PAGES, NOTES, "clé").map(h => h.note?.title)).toEqual([
      "Clé rouillée",
      "Rumeurs",
    ]);
  });

  it("cherche toujours dans les pages", () => {
    expect(searchWiki(PAGES, NOTES, "arkham")).toEqual([
      { pageId: "p2", note: null, excerpt: "" },
    ]);
  });

  it("ignore les dossiers, qui n'ont rien à ouvrir", () => {
    expect(searchWiki(PAGES, NOTES, "lieux")).toEqual([]);
  });

  it("ne rend rien sur une requête vide", () => {
    expect(searchWiki(PAGES, NOTES, "   ")).toEqual([]);
  });

  it("ignore la casse et les accents, des deux côtés", () => {
    expect(searchWiki(PAGES, NOTES, "CLE ROUILLEE")).toHaveLength(1);
  });
});
