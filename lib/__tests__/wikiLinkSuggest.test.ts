import { describe, it, expect } from "vitest";

import {
  completeLink,
  splitLinkQuery,
  suggestedSections,
  openLinkAt,
  normalizeForSearch,
  suggestedPages,
} from "@/lib/wikiLinkSuggest";

/** `|` marque le curseur : plus lisible qu'un indice à compter. */
function caret(marked: string) {
  return { text: marked.replace("|", ""), position: marked.indexOf("|") };
}

function enCours(marked: string) {
  const { text, position } = caret(marked);
  return openLinkAt(text, position);
}

function page(title: string, is_folder = false) {
  return { title, is_folder };
}

const PAGES = [
  page("Arkham"),
  page("Arkham Asylum"),
  page("Lieux", true),
  page("Shub-Niggurath"),
  page("Élévation"),
];

describe("openLinkAt", () => {
  it("repère le titre en train de s'écrire", () => {
    expect(enCours("On va à [[Ark|")).toEqual({ start: 10, query: "Ark" });
  });

  it("s'ouvre dès les deux crochets, sans rien de tapé", () => {
    expect(enCours("On va à [[|")).toEqual({ start: 10, query: "" });
  });

  it("ne voit rien sans crochets", () => {
    expect(enCours("On va à Ark|")).toBeNull();
  });

  it("s'arrête au lien déjà fermé", () => {
    expect(enCours("On va à [[Arkham]] puis ailleurs|")).toBeNull();
  });

  it("suit le dernier crochet ouvert quand il y en a deux", () => {
    expect(enCours("De [[Arkham]] à [[Inn|")).toEqual({ start: 18, query: "Inn" });
  });

  it("ne franchit pas le début de ligne", () => {
    // Un crochet oublié au paragraphe d'avant ne doit pas ouvrir la liste à
    // chaque mot qu'on écrit ensuite.
    expect(enCours("Une [[ligne\nla suivante|")).toBeNull();
  });

  it("renonce devant un titre déraisonnablement long", () => {
    expect(enCours(`[[${"a".repeat(81)}|`)).toBeNull();
  });
});

describe("suggestedPages", () => {
  it("propose ce qui commence par la requête, avant ce qui la contient", () => {
    expect(suggestedPages(PAGES, "ark").map(p => p.title)).toEqual([
      "Arkham",
      "Arkham Asylum",
    ]);
  });

  it("ignore la casse et les accents", () => {
    expect(suggestedPages(PAGES, "eleva").map(p => p.title)).toEqual(["Élévation"]);
  });

  it("écarte les dossiers : un lien vers un dossier ne mène à rien", () => {
    expect(suggestedPages(PAGES, "lieu")).toEqual([]);
  });

  it("propose tout, en ordre, quand rien n'est encore tapé", () => {
    expect(suggestedPages(PAGES, "").map(p => p.title)).toEqual([
      "Arkham",
      "Arkham Asylum",
      "Élévation",
      "Shub-Niggurath",
    ]);
  });

  it("s'arrête au nombre demandé", () => {
    expect(suggestedPages(PAGES, "", 2)).toHaveLength(2);
  });
});

describe("completeLink", () => {
  it("écrit le titre choisi et ferme le lien", () => {
    const { text, position } = caret("On va à [[Ark|");
    expect(completeLink(text, 10, position, "Arkham")).toEqual({
      value: "On va à [[Arkham]]",
      caret: 18,
    });
  });

  it("ne double pas un `]]` déjà là", () => {
    // On complète souvent au milieu d'un lien déjà fermé.
    const { text, position } = caret("On va à [[Ark|]] ce soir");
    expect(completeLink(text, 10, position, "Arkham")).toEqual({
      value: "On va à [[Arkham]] ce soir",
      caret: 18,
    });
  });
});

describe("normalizeForSearch", () => {
  it("abaisse la casse et retire les diacritiques", () => {
    expect(normalizeForSearch("Élévation")).toBe("elevation");
  });
});

describe("splitLinkQuery", () => {
  it("laisse la section à `null` tant qu'aucun `#` n'est tapé", () => {
    // C'est ce qui distingue « je cherche une page » de « j'ai ma page, je
    // cherche sa section ».
    expect(splitLinkQuery("Ark")).toEqual({ title: "Ark", section: null });
  });

  it("sépare la page de sa section", () => {
    expect(splitLinkQuery("Arkham#Le po")).toEqual({ title: "Arkham", section: "Le po" });
  });

  it("ouvre les sections dès le `#`, avant qu'on ait rien tapé", () => {
    expect(splitLinkQuery("Arkham#")).toEqual({ title: "Arkham", section: "" });
  });
});

describe("suggestedSections", () => {
  const TITRES = [
    { text: "Le port" },
    { text: "Les ruelles" },
    { text: "Le port de nuit" },
  ];

  it("garde l'ordre du document à pertinence égale", () => {
    // C'est l'ordre que l'auteur a en tête ; l'alphabet ne correspond à rien
    // de ce qu'il voit.
    expect(suggestedSections(TITRES, "le").map(h => h.text)).toEqual([
      "Le port",
      "Les ruelles",
      "Le port de nuit",
    ]);
  });

  it("place devant ce qui COMMENCE par la requête", () => {
    expect(suggestedSections(TITRES, "port").map(h => h.text)).toEqual([
      "Le port",
      "Le port de nuit",
    ]);
  });

  it("propose tout dès le `#`", () => {
    expect(suggestedSections(TITRES, "")).toHaveLength(3);
  });
});
