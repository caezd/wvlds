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

describe("resolveWikiLinks — sections", () => {
  const PAGES = [{ title: "Arkham", slug: "arkham" }];

  it("vise une section de la page ciblée", () => {
    // Les titres portent déjà un `id` (voir `extractHeadings`) : il ne manquait
    // qu'une syntaxe pour s'en servir.
    expect(resolveWikiLinks("[[Arkham#Le port]]", PAGES))
      .toBe("[Arkham#Le port](wiki:arkham#le-port)");
  });

  it("reste dans la page courante quand le titre manque", () => {
    expect(resolveWikiLinks("[[#Le port]]", PAGES))
      .toBe("[Le port](wiki:#le-port)");
  });

  it("ne pose pas d'ancre sur une page introuvable", () => {
    // Le lien est déjà cassé : une ancre n'y ajouterait qu'une fausse piste.
    expect(resolveWikiLinks("[[Innsmouth#Le port]]", PAGES))
      .toBe("[Innsmouth#Le port](wiki:)");
  });

  it("laisse intact un lien sans section", () => {
    expect(resolveWikiLinks("[[Arkham]]", PAGES)).toBe("[Arkham](wiki:arkham)");
  });
});
