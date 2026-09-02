import { describe, it, expect } from "vitest";

import {
  completerLien,
  lienEnCours,
  normaliserPourRecherche,
  pagesProposees,
} from "@/lib/wikiLinkSuggest";

/** `|` marque le curseur : plus lisible qu'un indice à compter. */
function curseur(marque: string) {
  return { texte: marque.replace("|", ""), position: marque.indexOf("|") };
}

function enCours(marque: string) {
  const { texte, position } = curseur(marque);
  return lienEnCours(texte, position);
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

describe("lienEnCours", () => {
  it("repère le titre en train de s'écrire", () => {
    expect(enCours("On va à [[Ark|")).toEqual({ debut: 10, requete: "Ark" });
  });

  it("s'ouvre dès les deux crochets, sans rien de tapé", () => {
    expect(enCours("On va à [[|")).toEqual({ debut: 10, requete: "" });
  });

  it("ne voit rien sans crochets", () => {
    expect(enCours("On va à Ark|")).toBeNull();
  });

  it("s'arrête au lien déjà fermé", () => {
    expect(enCours("On va à [[Arkham]] puis ailleurs|")).toBeNull();
  });

  it("suit le dernier crochet ouvert quand il y en a deux", () => {
    expect(enCours("De [[Arkham]] à [[Inn|")).toEqual({ debut: 18, requete: "Inn" });
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

describe("pagesProposees", () => {
  it("propose ce qui commence par la requête, avant ce qui la contient", () => {
    expect(pagesProposees(PAGES, "ark").map(p => p.title)).toEqual([
      "Arkham",
      "Arkham Asylum",
    ]);
  });

  it("ignore la casse et les accents", () => {
    expect(pagesProposees(PAGES, "eleva").map(p => p.title)).toEqual(["Élévation"]);
  });

  it("écarte les dossiers : un lien vers un dossier ne mène à rien", () => {
    expect(pagesProposees(PAGES, "lieu")).toEqual([]);
  });

  it("propose tout, en ordre, quand rien n'est encore tapé", () => {
    expect(pagesProposees(PAGES, "").map(p => p.title)).toEqual([
      "Arkham",
      "Arkham Asylum",
      "Élévation",
      "Shub-Niggurath",
    ]);
  });

  it("s'arrête au nombre demandé", () => {
    expect(pagesProposees(PAGES, "", 2)).toHaveLength(2);
  });
});

describe("completerLien", () => {
  it("écrit le titre choisi et ferme le lien", () => {
    const { texte, position } = curseur("On va à [[Ark|");
    expect(completerLien(texte, 10, position, "Arkham")).toEqual({
      value: "On va à [[Arkham]]",
      curseur: 18,
    });
  });

  it("ne double pas un `]]` déjà là", () => {
    // On complète souvent au milieu d'un lien déjà fermé.
    const { texte, position } = curseur("On va à [[Ark|]] ce soir");
    expect(completerLien(texte, 10, position, "Arkham")).toEqual({
      value: "On va à [[Arkham]] ce soir",
      curseur: 18,
    });
  });
});

describe("normaliserPourRecherche", () => {
  it("abaisse la casse et retire les diacritiques", () => {
    expect(normaliserPourRecherche("Élévation")).toBe("elevation");
  });
});
