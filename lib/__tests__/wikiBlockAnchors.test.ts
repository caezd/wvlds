import { describe, it, expect } from "vitest";
import {
  buildBlockAnchor,
  normaliserTexte,
  ressemblance,
  resolveBlockAnchor,
  type Bloc,
} from "@/lib/wikiBlockAnchors";

const p = (text: string): Bloc => ({ type: "p", text });
const li = (text: string): Bloc => ({ type: "li", text });

const ARTICLE: Bloc[] = [
  p("Mara Kline observe la ville."),
  p("Les Gardiens veillent sur Meridian."),
  p("La nuit tombe sur le quartier haut."),
];

/** Ancre du deuxième paragraphe, celui qu'on suit dans tous ces cas. */
const ANCRE = buildBlockAnchor(ARTICLE, 1)!;

describe("buildBlockAnchor", () => {
  it("retient le bloc et ses voisins", () => {
    expect(ANCRE).toEqual({
      type: "p",
      quote: "Les Gardiens veillent sur Meridian.",
      prefix: "Mara Kline observe la ville.",
      suffix: "La nuit tombe sur le quartier haut.",
      index: 1,
    });
  });

  it("n'ancre rien sur un bloc vide ou absent", () => {
    expect(buildBlockAnchor([p("")], 0)).toBeNull();
    expect(buildBlockAnchor(ARTICLE, 9)).toBeNull();
  });
});

describe("resolveBlockAnchor", () => {
  it("retrouve le bloc là où il était", () => {
    expect(resolveBlockAnchor(ARTICLE, ANCRE)).toBe(1);
  });

  it("suit le bloc quand un autre est inséré avant lui", () => {
    // Le cas qui motive tout ceci : insérer un paragraphe ne change le texte
    // d'aucun autre, l'ancre n'a donc rien perdu.
    const apres = [p("Un ajout en tête."), ...ARTICLE];
    expect(resolveBlockAnchor(apres, ANCRE)).toBe(2);
  });

  it("suit le bloc déplacé en fin d'article", () => {
    const apres = [ARTICLE[0], ARTICLE[2], ARTICLE[1]];
    expect(resolveBlockAnchor(apres, ANCRE)).toBe(2);
  });

  it("survit à une correction dans le bloc commenté", () => {
    // Une faute corrigée garde presque tous les mots : détacher ici serait
    // brutal, et l'auteur n'a pas changé de propos.
    const apres = [ARTICLE[0], p("Les Gardiens veillaient sur Meridian."), ARTICLE[2]];
    expect(resolveBlockAnchor(apres, ANCRE)).toBe(1);
  });

  it("détache quand le bloc est réécrit de fond en comble", () => {
    const apres = [ARTICLE[0], p("Personne ne surveille plus rien ici."), ARTICLE[2]];
    expect(resolveBlockAnchor(apres, ANCRE)).toBeNull();
  });

  it("détache quand le bloc est supprimé", () => {
    expect(resolveBlockAnchor([ARTICLE[0], ARTICLE[2]], ANCRE)).toBeNull();
  });

  it("ne confond pas un paragraphe avec la citation du même texte", () => {
    // Reprendre un passage en citation en fait un autre objet du texte, même
    // mot pour mot : le commentaire ne le suit pas.
    const apres = [ARTICLE[0], { type: "blockquote", text: ARTICLE[1].text }, ARTICLE[2]];
    expect(resolveBlockAnchor(apres, ANCRE)).toBeNull();
  });

  it("départage deux blocs jumeaux par leur voisinage", () => {
    // Deux éléments de liste identiques — le cas que la seule ressemblance ne
    // peut pas trancher.
    const liste: Bloc[] = [li("À faire"), li("oui"), li("Plus tard"), li("oui")];
    const ancre = buildBlockAnchor(liste, 3)!;
    // Un élément inséré en tête décale tout : seul le voisinage dit lequel des
    // deux « oui » était commenté.
    const apres: Bloc[] = [li("Nouveau"), ...liste];
    expect(resolveBlockAnchor(apres, ancre)).toBe(4);
  });

  it("s'en remet à l'ancienne place quand le voisinage se répète aussi", () => {
    const liste: Bloc[] = [li("a"), li("b"), li("a"), li("b"), li("a")];
    const ancre = buildBlockAnchor(liste, 3)!;
    expect(resolveBlockAnchor(liste, ancre)).toBe(3);
  });
});

describe("ressemblance", () => {
  it("vaut 1 pour deux textes identiques", () => {
    expect(ressemblance("un deux trois", "un deux trois")).toBe(1);
  });

  it("reste haute après une retouche", () => {
    expect(ressemblance("les gardiens veillent sur meridian", "les gardiens veillaient sur meridian"))
      .toBeGreaterThan(0.7);
  });

  it("reste basse entre deux phrases sans rapport", () => {
    expect(ressemblance("mara kline observe la ville", "le train part a huit heures"))
      .toBeLessThan(0.3);
  });

  it("ne compte qu'une fois un mot répété d'un seul côté", () => {
    // Sans multi-ensemble, « oui oui oui » paraîtrait pleinement contenu dans
    // « oui » et la ressemblance serait surestimée.
    expect(ressemblance("oui oui oui", "oui")).toBeCloseTo(0.5, 5);
  });

  it("vaut 0 face à du vide", () => {
    expect(ressemblance("quelque chose", "")).toBe(0);
  });
});

describe("normaliserTexte", () => {
  it("réduit les espaces du rendu", () => {
    expect(normaliserTexte("  Un\n  texte   coupé\n")).toBe("Un texte coupé");
  });
});
