import { describe, it, expect } from "vitest";

import { createSupabaseMock } from "@/test/supabaseMock";
import {
  buildSearchIndex,
  loadWorldWikiForSearch,
  searchPins,
  searchWiki,
  type SearchableNote,
  type SearchablePage,
  type SearchablePin,
} from "@/lib/wikiSearch";

const PAGES: SearchablePage[] = [
  { id: "p1", title: "Le Hub central", content: "Le cœur administratif.", is_folder: false },
  { id: "p2", title: "Arkham", content: "Une ville portuaire.", is_folder: false },
  { id: "d1", title: "Lieux", content: null, is_folder: true },
];

const NOTES: SearchableNote[] = [
  { id: "n1", page_id: "p1", title: "Clé rouillée", body: "Trouvée sous une dalle." },
  { id: "n2", page_id: "p2", title: "Rumeurs", body: "On parle d'une clé au fond du port." },
];

const PINS: SearchablePin[] = [
  { id: "pin1", map_id: "m1", title: "Le port d'Arkham", description: "Des quais brumeux." },
  { id: "pin2", map_id: "m2", title: "La tour", description: "On y entend le port la nuit." },
];

const INDEX = buildSearchIndex(PAGES, NOTES, PINS);

describe("searchWiki", () => {
  it("trouve une fiche par son titre, et dit de quelle page elle vient", () => {
    // Tout ce qu'on range dans la colonne de droite était introuvable : une
    // note qu'on ne retrouve pas est une note perdue.
    expect(searchWiki(INDEX, "rouillée")).toEqual([
      { pageId: "p1", note: { id: "n1", title: "Clé rouillée" }, excerpt: "" },
    ]);
  });

  it("trouve une fiche par son corps, avec l'extrait autour du terme", () => {
    const [hit] = searchWiki(INDEX, "fond du port");
    expect(hit.note?.title).toBe("Rumeurs");
    expect(hit.excerpt).toContain("fond du port");
  });

  it("place les titres devant les corps", () => {
    // Qui tape « clé » cherche plus probablement la fiche qui s'appelle ainsi
    // que le paragraphe qui en parle.
    expect(searchWiki(INDEX, "clé").map(h => h.note?.title)).toEqual([
      "Clé rouillée",
      "Rumeurs",
    ]);
  });

  it("cherche toujours dans les pages", () => {
    expect(searchWiki(INDEX, "arkham")).toEqual([
      { pageId: "p2", note: null, excerpt: "" },
    ]);
  });

  it("ignore les dossiers, qui n'ont rien à ouvrir", () => {
    expect(searchWiki(INDEX, "lieux")).toEqual([]);
  });

  it("ne rend rien sur une requête vide", () => {
    expect(searchWiki(INDEX, "   ")).toEqual([]);
  });

  it("ignore la casse et les accents, des deux côtés", () => {
    expect(searchWiki(INDEX, "CLE ROUILLEE")).toHaveLength(1);
  });
});

describe("buildSearchIndex", () => {
  it("écarte les dossiers d'emblée", () => {
    expect(INDEX.pages.map(p => p.id)).toEqual(["p1", "p2"]);
  });

  it("garde le texte d'origine pour l'extrait, et le normalisé pour chercher", () => {
    // L'index trouvé dans l'un doit tomber juste dans l'autre : la
    // normalisation ne change pas la longueur.
    const note = INDEX.notes.find(n => n.id === "n1")!;
    expect(note.body).toBe("Trouvée sous une dalle.");
    expect(note.normalizedBody).toBe("trouvee sous une dalle.");
    expect(note.normalizedBody.length).toBe(note.body.length);
  });
});

describe("loadWorldWikiForSearch", () => {
  it("lit les pages puis les fiches, et rend de quoi chercher et ouvrir", async () => {
    // Le mock sert ses résultats dans l'ordre des appels à `.from()` : les
    // pages d'abord, les fiches ensuite.
    const mock = createSupabaseMock({
      results: [
        { data: [{ id: "p1", title: "Arkham", slug: "arkham", content: "Une ville.", is_folder: false }], error: null },
        { data: [{ id: "n1", page_id: "p1", title: "Rumeurs", body: "On parle du port." }], error: null },
      ],
    });

    const { index, pagesById } = await loadWorldWikiForSearch(mock.client as never, "w1");

    expect(pagesById.get("p1")).toEqual({ title: "Arkham", slug: "arkham" });
    expect(searchWiki(index, "port").map(h => h.note?.title)).toEqual(["Rumeurs"]);
  });

  it("supporte un monde sans wiki", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }, { data: null, error: null }] });
    const { index, pagesById } = await loadWorldWikiForSearch(mock.client as never, "w1");
    expect(index).toEqual({ pages: [], notes: [], pins: [] });
    expect(pagesById.size).toBe(0);
  });
});

describe("searchPins", () => {
  it("trouve un lieu par son titre, puis par sa description", () => {
    // La carte restait muette dans la recherche : un lieu ne se retrouvait
    // qu'en la promenant à l'œil.
    expect(searchPins(INDEX, "port").map(h => [h.pinId, h.excerpt === ""])).toEqual([
      ["pin1", true],   // le titre suffit
      ["pin2", false],  // trouvé dans la description, avec un extrait
    ]);
  });

  it("dit sur quelle carte ouvrir le lieu", () => {
    expect(searchPins(INDEX, "tour")[0]).toMatchObject({ pinId: "pin2", mapId: "m2", title: "La tour" });
  });

  it("ne rend rien sans requête, ni sans lieu", () => {
    expect(searchPins(INDEX, "  ")).toEqual([]);
    expect(searchPins(buildSearchIndex(PAGES, NOTES), "port")).toEqual([]);
  });

  it("ne touche pas aux résultats du wiki", () => {
    // Une fonction à part : un lieu ne s'ouvre pas comme une page. Les
    // résultats du wiki sont les mêmes que l'index porte des lieux ou non.
    expect(searchWiki(INDEX, "port")).toEqual(searchWiki(buildSearchIndex(PAGES, NOTES), "port"));
  });
});
