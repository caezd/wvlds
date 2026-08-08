import { describe, it, expect } from "vitest";
import { resolveWikiLinks } from "@/lib/wikiLinks";

const PAGES = [
  { title: "Accueil", slug: "accueil" },
  { title: "La Forêt Noire", slug: "foret-noire" },
];

describe("resolveWikiLinks", () => {
  it("résout un titre connu en lien wiki:", () => {
    expect(resolveWikiLinks("[[Accueil]]", PAGES)).toBe("[Accueil](wiki:accueil)");
  });

  it("est insensible à la casse du titre", () => {
    expect(resolveWikiLinks("[[accueil]]", PAGES)).toBe("[accueil](wiki:accueil)");
  });

  it("ignore les espaces superflus autour du titre", () => {
    expect(resolveWikiLinks("[[  Accueil  ]]", PAGES)).toBe("[Accueil](wiki:accueil)");
  });

  it("produit un slug vide (lien cassé) pour un titre inconnu", () => {
    expect(resolveWikiLinks("[[Titre inconnu]]", PAGES)).toBe("[Titre inconnu](wiki:)");
  });

  it("laisse le texte autour intact", () => {
    expect(resolveWikiLinks("avant [[Accueil]] après", PAGES)).toBe("avant [Accueil](wiki:accueil) après");
  });

  it("résout plusieurs liens sur la même ligne", () => {
    expect(resolveWikiLinks("[[Accueil]] et [[La Forêt Noire]]", PAGES)).toBe(
      "[Accueil](wiki:accueil) et [La Forêt Noire](wiki:foret-noire)",
    );
  });

  it("ignore un [[...]] à l'intérieur d'un bloc de code fencé", () => {
    const input = "```\n[[Accueil]]\n```";
    expect(resolveWikiLinks(input, PAGES)).toBe(input);
  });

  it("ignore un [[...]] à l'intérieur d'un extrait de code inline", () => {
    expect(resolveWikiLinks("Syntaxe : `[[Accueil]]`", PAGES)).toBe("Syntaxe : `[[Accueil]]`");
  });

  it("laisse un [[ ]] vide tel quel plutôt que de créer un lien vide", () => {
    expect(resolveWikiLinks("[[]]", PAGES)).toBe("[[]]");
  });

  it("produit un slug vide (lien cassé) pour un titre partagé par deux pages", () => {
    // Seul (world_id, slug) est unique — deux pages peuvent avoir le même
    // titre (le dédoublonnage à la création ne renomme que le slug).
    const pagesWithDuplicateTitle = [
      { title: "Aria", slug: "aria" },
      { title: "Aria", slug: "aria-2" },
    ];
    expect(resolveWikiLinks("[[Aria]]", pagesWithDuplicateTitle)).toBe("[Aria](wiki:)");
  });
});
