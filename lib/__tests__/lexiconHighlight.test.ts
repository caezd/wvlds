import { describe, it, expect } from "vitest";
import { highlightLexiconTerms } from "@/lib/lexiconHighlight";

const TERMS = [
  { id: "t1", term: "Dragon" },
  { id: "t2", term: "Ordre Noir" },
  { id: "t3", term: "Ordre" },
];

describe("highlightLexiconTerms", () => {
  it("surligne une occurrence unique", () => {
    expect(highlightLexiconTerms("Un Dragon approche.", TERMS)).toBe(
      "Un [Dragon](lexicon:t1) approche.",
    );
  });

  it("surligne toutes les occurrences, pas seulement la première", () => {
    expect(highlightLexiconTerms("Dragon contre Dragon.", TERMS)).toBe(
      "[Dragon](lexicon:t1) contre [Dragon](lexicon:t1).",
    );
  });

  it("est insensible à la casse mais conserve la casse d'origine dans le texte affiché", () => {
    expect(highlightLexiconTerms("un dragon, puis DRAGON", TERMS)).toBe(
      "un [dragon](lexicon:t1), puis [DRAGON](lexicon:t1)",
    );
  });

  it("préfère le terme le plus long quand il en contient un plus court", () => {
    expect(highlightLexiconTerms("L'Ordre Noir avance.", TERMS)).toBe(
      "L'[Ordre Noir](lexicon:t2) avance.",
    );
  });

  it("surligne le terme court seul quand le terme long n'est pas présent", () => {
    expect(highlightLexiconTerms("L'Ordre avance.", TERMS)).toBe(
      "L'[Ordre](lexicon:t3) avance.",
    );
  });

  it("respecte les frontières de mots (pas de match partiel)", () => {
    expect(highlightLexiconTerms("Ordonnance et Dragonne ne comptent pas.", TERMS)).toBe(
      "Ordonnance et Dragonne ne comptent pas.",
    );
  });

  it("reconnaît un terme accentué même précédé d'une lettre non accentuée adjacente", () => {
    // "châteaux" ne doit pas déclencher "eau" : la frontière doit rester
    // stricte même quand le caractère voisin est une lettre accentuée.
    const terms = [{ id: "t1", term: "eau" }];
    expect(highlightLexiconTerms("châteaux et eau", terms)).toBe("châteaux et [eau](lexicon:t1)");
  });

  it("respecte les frontières avec des lettres accentuées des deux côtés", () => {
    const terms = [{ id: "t1", term: "île" }];
    expect(highlightLexiconTerms("presqu'île et une île déserte", terms)).toBe(
      "presqu'[île](lexicon:t1) et une [île](lexicon:t1) déserte",
    );
  });

  it("ignore un terme à l'intérieur d'un bloc de code fencé", () => {
    const input = "```\nUn Dragon ici\n```";
    expect(highlightLexiconTerms(input, TERMS)).toBe(input);
  });

  it("ignore un terme à l'intérieur d'un extrait de code inline", () => {
    expect(highlightLexiconTerms("Syntaxe : `Dragon`", TERMS)).toBe("Syntaxe : `Dragon`");
  });

  it("ignore un terme déjà à l'intérieur d'un lien markdown existant", () => {
    expect(highlightLexiconTerms("[Dragon](wiki:dragon-page)", TERMS)).toBe(
      "[Dragon](wiki:dragon-page)",
    );
  });

  it("ne modifie rien sans terme correspondant", () => {
    expect(highlightLexiconTerms("Rien à signaler ici.", TERMS)).toBe("Rien à signaler ici.");
  });

  it("retourne le texte tel quel sans liste de termes", () => {
    expect(highlightLexiconTerms("Un Dragon approche.", [])).toBe("Un Dragon approche.");
  });

  it("ignore les entrées avec un terme vide", () => {
    expect(highlightLexiconTerms("texte", [{ id: "t1", term: "   " }])).toBe("texte");
  });
});
