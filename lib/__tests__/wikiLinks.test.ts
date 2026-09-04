import { describe, it, expect } from "vitest";
import { resolveWikiLinks, splitMapLinkPrefix } from "@/lib/wikiLinks";

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

describe("resolveWikiLinks — homonymes", () => {
  it("laisse un titre vraiment ambigu non résolu", () => {
    // Deux pages « Test » à l'identique : pointer l'une des deux au hasard
    // serait pire qu'un lien cassé, qui se voit.
    const pages = [{ title: "Test", slug: "test" }, { title: "Test", slug: "test-2" }];
    expect(resolveWikiLinks("[[Test]]", pages)).toBe("[Test](wiki:)");
  });

  it("donne le dernier mot au titre écrit à la lettre", () => {
    // Le cas rencontré : « test », « Test » et un dossier « test » dans le même
    // monde. `[[Test]]` désigne sans équivoque la page « Test » — c'est
    // d'ailleurs ce que l'autocomplétion a écrit.
    const pages = [
      { title: "test", slug: "test-2" },
      { title: "Test", slug: "test" },
      { title: "test", slug: "test-3", is_folder: true },
    ];
    expect(resolveWikiLinks("[[Test]]", pages)).toBe("[Test](wiki:test)");
    expect(resolveWikiLinks("[[Test#Description]]", pages))
      .toBe("[Test#Description](wiki:test#description)");
  });

  it("ne laisse pas un dossier rendre une page introuvable", () => {
    const pages = [
      { title: "Lieux", slug: "lieux", is_folder: true },
      { title: "lieux", slug: "lieux-2" },
    ];
    expect(resolveWikiLinks("[[Lieux]]", pages)).toBe("[Lieux](wiki:lieux-2)");
  });

  it("compare sans la casse quand une seule page porte ce titre", () => {
    const pages = [{ title: "Arkham", slug: "arkham" }];
    expect(resolveWikiLinks("[[arkham]]", pages)).toBe("[arkham](wiki:arkham)");
  });
});

describe("resolveWikiLinks — [[lieu:…]]", () => {
  // Un lieu de la carte se cite comme une page : la carte cesse d'être un
  // dessin à part pour devenir quelque chose que le texte désigne.
  const PINS = [
    { id: "pin1", title: "Le port", map_id: "m1" },
    { id: "pin2", title: "La tour", map_id: "m2" },
  ];

  it("résout un lieu connu en lien map:, sans le préfixe dans le libellé", () => {
    expect(resolveWikiLinks("[[lieu:Le port]]", PAGES, PINS)).toBe("[Le port](map:pin1)");
  });

  it("accepte le préfixe dans les trois langues, et sans égard à la casse", () => {
    expect(resolveWikiLinks("[[place:Le port]]", PAGES, PINS)).toBe("[Le port](map:pin1)");
    expect(resolveWikiLinks("[[lugar:Le port]]", PAGES, PINS)).toBe("[Le port](map:pin1)");
    expect(resolveWikiLinks("[[LIEU:le port]]", PAGES, PINS)).toBe("[le port](map:pin1)");
  });

  it("produit un lien cassé pour un lieu inconnu", () => {
    expect(resolveWikiLinks("[[lieu:Innsmouth]]", PAGES, PINS)).toBe("[Innsmouth](map:)");
  });

  it("produit un lien cassé pour un titre porté par deux lieux", () => {
    // Deux « Le port » sur deux cartes : la même règle que les pages homonymes.
    const doublons = [...PINS, { id: "pin3", title: "Le port", map_id: "m2" }];
    expect(resolveWikiLinks("[[lieu:Le port]]", PAGES, doublons)).toBe("[Le port](map:)");
  });

  it("ne confond pas un lieu et une page du même nom", () => {
    const pages = [...PAGES, { title: "Le port", slug: "le-port" }];
    expect(resolveWikiLinks("[[Le port]] et [[lieu:Le port]]", pages, PINS)).toBe(
      "[Le port](wiki:le-port) et [Le port](map:pin1)",
    );
  });

  it("laisse un [[lieu:]] vide tel quel", () => {
    expect(resolveWikiLinks("[[lieu:]]", PAGES, PINS)).toBe("[[lieu:]]");
  });

  it("n'a pas besoin de lieux pour résoudre les pages", () => {
    expect(resolveWikiLinks("[[Accueil]]", PAGES)).toBe("[Accueil](wiki:accueil)");
  });
});

describe("splitMapLinkPrefix", () => {
  it("sépare le préfixe tel qu'écrit du titre", () => {
    expect(splitMapLinkPrefix("lieu:Le port")).toEqual({ prefix: "lieu:", title: "Le port" });
    expect(splitMapLinkPrefix("Place:")).toEqual({ prefix: "Place:", title: "" });
  });

  it("ne voit pas de lieu dans un titre ordinaire", () => {
    expect(splitMapLinkPrefix("Arkham")).toBeNull();
    expect(splitMapLinkPrefix("Le lieu: dit")).toBeNull();
  });
});
