import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
// Le panneau de notes est monté d'office depuis que la colonne s'ouvre sur son
// onglet ; il lit ses propres tables et décalerait la file de résultats du
// mock. Ces tests portent sur le contenu de la page et ses commentaires : on
// le remplace par un marqueur inerte (il a ses propres tests).
vi.mock("@/components/worlds/wiki/WikiNotesPanel", () => ({
  WikiNotesPanel: () => <div data-testid="panneau-notes" />,
}));

vi.mock("@/app/(protected)/w/actions", () => ({ saveWorldPrefs: vi.fn() }));

// Le champ de l'article est le vrai CodeEditor — un <textarea>. Seule sa
// coloration est écartée : elle charge Shiki, hors sujet et lent ici.
vi.mock("@/lib/codeHighlighter", () => ({
  highlightCode: () => Promise.reject(new Error("coloration hors test")),
  preloadCodeHighlighter: () => () => {},
}));

// Les notes sont maintenant chargées par la page — pour annoncer leur nombre
// même panneau fermé. Elles interrogent leurs propres tables et décaleraient
// la file de résultats du mock, qui sert dans l'ordre des appels à `.from()`.
// Ces tests portent sur l'article et ses commentaires : on neutralise.
vi.mock("@/hooks/useWikiPageNotes", () => ({
  useWikiPageNotes: () => ({
    categories: [],
    notes: [],
    groups: [],
    loading: false,
    pending: false,
    createCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    reorderCategories: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    moveNote: vi.fn(),
    reload: vi.fn(),
  }),
}));

const mdProps = vi.fn();
vi.mock("@/components/MarkdownRenderer", () => ({
  default: (props: Record<string, unknown>) => {
    mdProps(props);
    return <div data-testid="markdown" />;
  },
}));

import { WorldWiki, firstPageOf } from "@/components/worlds/wiki/WorldWiki";
import type { WikiPage } from "@/components/worlds/wiki/WorldWiki";

const PAGE = {
  id: "p1",
  world_id: "w1",
  parent_id: null,
  title: "Accueil",
  slug: "accueil",
  content: "Bonjour",
  is_folder: false,
  sort_index: 0,
  icon: null,
};

const FOLDER = {
  id: "f1",
  world_id: "w1",
  parent_id: null,
  title: "Lieux",
  slug: "lieux",
  content: null,
  is_folder: true,
  sort_index: 1,
  icon: null,
};

const NESTED_PAGE = {
  id: "p2",
  world_id: "w1",
  parent_id: "f1",
  title: "La Forêt Noire",
  slug: "foret-noire",
  content: "Une forêt sombre et dangereuse.",
  is_folder: false,
  sort_index: 0,
  icon: null,
};

/**
 * Une fenêtre assez large pour les deux colonnes.
 *
 * Le wiki ne les monte que si la zone mesurée laisse à l'article sa pleine
 * mesure. Sous jsdom rien n'a de taille et l'observateur de `vitest.setup.ts`
 * ne rappelle jamais : sans ce souffleur, l'arbre de navigation serait absent
 * de tous ces tests, qui portent sur la disposition de bureau.
 */
const LARGEUR_ZONE = 1600;
beforeEach(() => {
  window.ResizeObserver = class {
    constructor(private rappel: ResizeObserverCallback) {}
    observe(cible: Element) {
      this.rappel(
        [{ target: cible, contentRect: { width: LARGEUR_ZONE } } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

/**
 * Le titre d'une page dans l'arbre de navigation. Depuis que la première page
 * s'ouvre d'office, le même texte apparaît aussi en titre du contenu : une
 * requête par texte seul en trouverait deux.
 */
async function dansLArbre(titre: string) {
  const nav = await screen.findByRole("navigation");
  return within(nav).getByText(titre);
}

/**
 * Passe en mode modification.
 *
 * La bascule vit au-dessus de l'article, dans un bloc que le chargement des
 * pages remplace : la chercher avant que l'arbre soit là revient à cliquer sur
 * un bouton détaché du DOM entre la requête et le clic. On réessaie donc
 * jusqu'à ce que le mode soit effectivement actif — ce qu'un être humain, qui
 * ne clique pas plus vite que la page ne charge, obtient du premier coup.
 */
async function activerModification(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(async () => {
    if (screen.queryByText("Modification active")) return;
    await user.click(screen.getByText("Modifier"));
    expect(screen.getByText("Modification active")).toBeInTheDocument();
  });
}

function setup() {
  const mock = createSupabaseMock({ results: [{ data: [PAGE], error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

function setupWithFolder() {
  const mock = createSupabaseMock({ results: [{ data: [PAGE, FOLDER, NESTED_PAGE], error: null }] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

describe("WorldWiki — barre de mise en forme et images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche le contenu publié avec les images autorisées", async () => {
    setup();
    render(<WorldWiki worldId="w1" canEdit={false} />);

    await userEvent.click(await dansLArbre("Accueil"));

    expect(mdProps).toHaveBeenCalledWith(
      expect.objectContaining({ allowImages: true }),
    );
  });

  it("offre la ceinture de mise en forme dans le sous-en-tête en édition", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    // Le mode modification ouvre l'éditeur de l'article : un seul geste.
    await activerModification(user);

    const ceinture = await screen.findByRole("toolbar", { name: "Mise en forme" });
    expect(within(ceinture).getByRole("button", { name: "Gras" })).toBeTruthy();
  });

  it("écrit le markdown dans le champ, sans le passer par un éditeur enrichi", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await activerModification(user);

    const champ = await screen.findByLabelText("Contenu de l'article");
    await user.clear(champ);
    await user.type(champ, "Un **essai**");
    // Le champ montre la syntaxe telle qu'elle sera enregistrée : c'est tout
    // l'intérêt d'écrire dans la source plutôt que dans un rendu.
    expect(champ).toHaveValue("Un **essai**");
  });
});

describe("WorldWiki — recherche et fil d'Ariane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("la recherche filtre et la sélection d'un résultat déplie le dossier parent", async () => {
    setupWithFolder();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit={false} />);

    await dansLArbre("Accueil");

    await user.type(screen.getByPlaceholderText("Rechercher dans le wiki…"), "forêt");
    await user.click(await screen.findByText("La Forêt Noire"));

    // La recherche se referme après sélection...
    expect(screen.getByPlaceholderText("Rechercher dans le wiki…")).toHaveValue("");
    // ...et le dossier ancêtre apparaît déplié dans l'arbre (et dans le fil d'Ariane du contenu sélectionné).
    expect(screen.getAllByText("Lieux").length).toBeGreaterThan(0);
  });

  it("affiche le fil d'Ariane du dossier parent dans l'en-tête principal", async () => {
    setupWithFolder();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit={false} />);

    await dansLArbre("Accueil");
    await user.click(await dansLArbre("Lieux")); // déplie le dossier
    await user.click(await screen.findByText("La Forêt Noire"));

    // Le chemin suit le nom du wiki dans le même bandeau, comme le nom d'un
    // salon suit celui de son monde.
    const enTete = screen.getByText("Annexes").closest("div")!;
    const chemin = within(enTete).getByRole("navigation");
    expect(within(chemin).getByRole("button", { name: "Lieux" })).toBeTruthy();
  });

  it("le titre d'une page est atteignable au clavier", async () => {
    // L'arbre du wiki était une pile de `<div onClick>` : naviguer dans le wiki
    // au clavier était impossible. Le titre porte désormais l'action, la ligne
    // restant cliquable à la souris — elle ne peut pas devenir un bouton, elle
    // contient déjà une poignée de déplacement et un menu.
    setupWithFolder();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit={false} />);

    await dansLArbre("Accueil");
    const dossier = screen.getByRole("button", { name: "Lieux" });

    dossier.focus();
    expect(dossier).toHaveFocus();
    expect(dossier).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("{Enter}");
    // Le dossier s'ouvre : son contenu apparaît, et l'état est annoncé.
    expect(await screen.findByText("La Forêt Noire")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lieux" })).toHaveAttribute("aria-expanded", "true");
  });

  it("cliquer le titre d'un dossier ne le replie pas aussitôt", async () => {
    // Le titre est un bouton DANS une ligne elle-même cliquable. Sans
    // `stopPropagation`, le clic remonterait et `onToggleFolder` s'exécuterait
    // deux fois — le dossier s'ouvrirait puis se refermerait, sans que rien ne
    // bouge à l'écran.
    setupWithFolder();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit={false} />);

    await dansLArbre("Accueil");
    await user.click(screen.getByRole("button", { name: "Lieux" }));

    expect(await screen.findByText("La Forêt Noire")).toBeInTheDocument();
  });
});

describe("WorldWiki — création depuis un modèle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("un modèle pré-remplit le brouillon et ouvre directement en édition", async () => {
    const insertedPage = {
      id: "p3",
      world_id: "w1",
      parent_id: null,
      title: "Aria",
      slug: "aria",
      content: null,
      is_folder: false,
      sort_index: 0,
      icon: "user-round",
      is_restricted: false,
      banner_url: null,
      description: null,
      draft_updated_at: "2026-01-01T00:00:00.000Z",
      published_at: null,
    };
    const templateContent =
      "## Apparence\n\n## Personnalité\n\n## Histoire\n\n## Relations\n\n## Objectifs\n\n## Notes";
    const mock = createSupabaseMock({
      results: [
        { data: [], error: null }, // load() initial (pages)
        { data: [], error: null }, // load() initial (lexique)
        { data: insertedPage, error: null },
        { data: [], error: null }, // annotations de la page, lues à son montage
        { data: { draft_content: templateContent }, error: null },
      ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await activerModification(user);
    await user.click(screen.getByText("Page"));

    await user.click(screen.getByTitle("Modèle"));
    await user.click(screen.getByRole("menuitem", { name: /Fiche personnage/ }));

    await user.type(screen.getByPlaceholderText("Titre de la page…"), "Aria{Enter}");

    expect(await screen.findByLabelText("Contenu de l'article")).toHaveValue(templateContent);
  });
});

describe("WorldWiki — pages restreintes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bascule une page en « réservée aux éditeurs » depuis le menu ⋯", async () => {
    const mock = createSupabaseMock({ results: [{ data: [PAGE], error: null }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await activerModification(user);

    await user.click(screen.getByLabelText("Options"));
    await user.click(screen.getByText("Réserver aux éditeurs"));

    // Index non figé : l'entrée en modification lit d'abord le brouillon de la
    // page, ce qui décale les appels suivants.
    await waitFor(() => {
      const appels = mock.buildersFor("world_wiki_pages")
        .flatMap(b => b.update.mock.calls.map(c => c[0]));
      expect(appels).toContainEqual({ is_restricted: true });
    });
  });

  it("réordonne une page depuis le menu ⋯, sans souris", async () => {
    // Le glisser-déposer était le seul chemin vers l'ordre des pages, et il
    // demande un pointeur : au clavier, l'arbre était figé.
    const mock = createSupabaseMock({
      results: [{ data: [PAGE, FOLDER, NESTED_PAGE], error: null }],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await activerModification(user);
    const ligne = (await dansLArbre("Accueil")).closest("div")!;
    await user.click(within(ligne).getByRole("button", { name: "Options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Descendre" }));

    // « Accueil » passe derrière « Lieux » : les deux rangs s'échangent.
    await waitFor(() => {
      const appels = mock.buildersFor("world_wiki_pages")
        .flatMap(b => b.update.mock.calls.map(c => c[0]));
      expect(appels).toContainEqual({ parent_id: null, sort_index: 1 });
      expect(appels).toContainEqual({ parent_id: null, sort_index: 0 });
    });
  });

  it("ne propose que les déplacements qui ont un sens", async () => {
    // Proposer « Monter » à la première page de sa liste ne ferait qu'un clic
    // sans effet ; « Sortir » n'a rien à dire à une page déjà à la racine.
    const mock = createSupabaseMock({
      results: [{ data: [PAGE, FOLDER, NESTED_PAGE], error: null }],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await activerModification(user);
    const ligne = (await dansLArbre("Accueil")).closest("div")!;
    await user.click(within(ligne).getByRole("button", { name: "Options" }));

    await screen.findByRole("menuitem", { name: "Descendre" });
    expect(screen.queryByRole("menuitem", { name: "Monter" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Sortir du dossier" })).toBeNull();
  });
});

describe("WorldWiki — cascade de renommage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renommer une page déclenche la cascade des liens internes vers l'ancien titre", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: [PAGE], error: null }, // load() initial (pages)
        { data: [], error: null },     // load() initial (lexique)
        { data: null, error: null },   // update du titre
        { data: [PAGE], error: null }, // load() de rafraîchissement après cascade
      ],
    });
    mock.rpc.mockResolvedValueOnce({ data: 2, error: null });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await activerModification(user);

    // Le titre est un champ dès l'entrée en modification : plus de menu.
    const input = await screen.findByDisplayValue("Accueil");
    await user.clear(input);
    await user.type(input, "Nouveau titre{Enter}");

    await waitFor(() => {
      expect(mock.rpc).toHaveBeenCalledWith("wwp_rename_cascade", {
        p_world_id: "w1",
        p_old_title: "Accueil",
        p_new_title: "Nouveau titre",
      });
    });
  });

  it("confirmer un renommage sans rien avoir changé n'écrit rien", async () => {
    // L'ancien renommage, dans l'arbre, écrivait à chaque validation — même
    // quand ni le titre ni l'icône n'avaient bougé. Le renommage depuis le
    // corps se tait dans ce cas, et ne déclenche donc pas non plus la cascade
    // des liens internes.
    const mock = createSupabaseMock({
      results: [
        { data: [PAGE], error: null }, // load() initial (pages)
        { data: [], error: null },     // load() initial (lexique)
      ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await activerModification(user);

    const input = await screen.findByDisplayValue("Accueil");
    await user.type(input, "{Enter}");

    // Le champ reste — c'est l'écriture qui ne part pas.
    expect(mock.buildersFor("world_wiki_pages")).toHaveLength(2); // pages + brouillon
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("WorldWiki — sélection initiale via initialSlug (raccourci externe)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sélectionne la page ciblée par initialSlug dès le chargement, sans clic", async () => {
    setupWithFolder();
    render(<WorldWiki worldId="w1" canEdit={false} initialSlug="foret-noire" />);

    await waitFor(() => {
      expect(mdProps).toHaveBeenCalledWith(
        expect.objectContaining({ content: NESTED_PAGE.content }),
      );
    });
  });

  it("déplie le dossier ancêtre de la page ciblée", async () => {
    setupWithFolder();
    render(<WorldWiki worldId="w1" canEdit={false} initialSlug="foret-noire" />);

    // Titre de la page ouverte (h1) — distinct de son entrée dans l'arbre latéral.
    expect(await screen.findByRole("heading", { name: "La Forêt Noire" })).toBeInTheDocument();
  });

  it("ignore un slug inconnu sans planter", async () => {
    setup();
    render(<WorldWiki worldId="w1" canEdit={false} initialSlug="inexistant" />);

    expect(await dansLArbre("Accueil")).toBeInTheDocument();
    expect(mdProps).not.toHaveBeenCalled();
  });
});

describe("WorldWiki — lexique du monde", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("charge le lexique et le transmet à MarkdownRenderer", async () => {
    const term = { id: "t1", world_id: "w1", term: "Dragon", description: "Une créature." };
    const mock = createSupabaseMock({
      results: [
        { data: [PAGE], error: null }, // load() initial (pages)
        { data: [term], error: null }, // load() initial (lexique)
      ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(<WorldWiki worldId="w1" canEdit={false} />);
    await userEvent.click(await dansLArbre("Accueil"));

    await waitFor(() => {
      expect(mdProps).toHaveBeenCalledWith(expect.objectContaining({ lexiconTerms: [term] }));
    });
  });
});

describe("WorldWiki — libellé personnalisé du panneau", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche le libellé traduit par défaut sans prop label", () => {
    setup();
    render(<WorldWiki worldId="w1" canEdit={false} />);

    expect(screen.getByText("Annexes")).toBeInTheDocument();
  });

  it("affiche le libellé personnalisé quand il est fourni", () => {
    setup();
    render(<WorldWiki worldId="w1" canEdit={false} label="Compendium" />);

    expect(screen.getByText("Compendium")).toBeInTheDocument();
    expect(screen.queryByText("Annexes")).not.toBeInTheDocument();
  });
});

describe("firstPageOf", () => {
  function page(over: Partial<WikiPage> & { id: string }): WikiPage {
    return {
      world_id: "w1",
      parent_id: null,
      title: over.id,
      slug: over.id,
      content: null,
      is_folder: false,
      sort_index: 0,
      icon: null,
      is_restricted: false,
      banner_url: null,
      description: null,
      draft_updated_at: null,
      published_at: null,
      ...over,
    };
  }

  it("suit l'ordre de tri, pas l'ordre du tableau", () => {
    const pages = [page({ id: "b", sort_index: 1 }), page({ id: "a", sort_index: 0 })];
    expect(firstPageOf(pages)?.id).toBe("a");
  });

  it("entre dans un dossier plutôt que de l'ouvrir lui-même", () => {
    const pages = [
      page({ id: "dossier", is_folder: true, sort_index: 0 }),
      page({ id: "dedans", parent_id: "dossier", sort_index: 0 }),
      page({ id: "after", sort_index: 1 }),
    ];
    expect(firstPageOf(pages)?.id).toBe("dedans");
  });

  it("passe au frère suivant quand le dossier est vide", () => {
    const pages = [
      page({ id: "vide", is_folder: true, sort_index: 0 }),
      page({ id: "after", sort_index: 1 }),
    ];
    expect(firstPageOf(pages)?.id).toBe("after");
  });

  it("descend d'un dossier à l'autre", () => {
    const pages = [
      page({ id: "haut", is_folder: true, sort_index: 0 }),
      page({ id: "bas", parent_id: "haut", is_folder: true, sort_index: 0 }),
      page({ id: "fond", parent_id: "bas", sort_index: 0 }),
    ];
    expect(firstPageOf(pages)?.id).toBe("fond");
  });

  it("ne renvoie rien quand il n'y a que des dossiers", () => {
    expect(firstPageOf([page({ id: "dossier", is_folder: true })])).toBeNull();
  });

  it("ne renvoie rien sur un wiki vide", () => {
    expect(firstPageOf([])).toBeNull();
  });
});

describe("WorldWiki — l'adresse suit la page ouverte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/w/w1?view=wiki");
  });

  it("écrit la page choisie dans l'adresse", async () => {
    // Le wiki n'y touchait pas : on ne pouvait pas partager ce qu'on lisait,
    // et le bouton Précédent sortait du wiki d'un bond.
    setupWithFolder();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit={false} />);

    await user.click(await dansLArbre("Accueil"));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("page")).toBe("accueil"),
    );
  });

  it("rouvre la page que le bouton Précédent désigne", async () => {
    setupWithFolder();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit={false} />);

    await user.click(await dansLArbre("Accueil"));
    // Le retour en arrière, tel que le navigateur le produit : l'adresse
    // change, puis `popstate` prévient.
    window.history.replaceState(null, "", "/w/w1?view=wiki&page=lieux");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("page")).toBe("lieux"),
    );
  });
});

describe("WorldWiki — suppression d'une page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.pointerEvents = "";
  });

  it("laisse l'application cliquable apres une suppression confirmee", async () => {
    // Meme piege que sur les commentaires : le menu ⋯ et le dialogue de
    // confirmation se chevauchent, et Radix rend `document.body` inerte tant
    // qu'une couche modale vit. Si l'une disparait sans que son nettoyage
    // passe, plus rien n'est cliquable dans l'application.
    setup();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await activerModification(user);
    const ligne = (await dansLArbre("Accueil")).closest("div")!;
    await user.click(within(ligne).getByRole("button", { name: "Options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(document.body.style.pointerEvents).not.toBe("none"));
  });

  it("emporte les images du dossier de la page supprimée", async () => {
    // Le rangement par `world-<id>/page-<id>/` n'a d'intérêt que si quelqu'un
    // s'en sert : c'est ici que la suppression devient possible. Sans cela les
    // fichiers restaient à jamais, payés et introuvables.
    const mock = createSupabaseMock({
      results: [{ data: [PAGE, FOLDER, NESTED_PAGE], error: null }],
      storageListResult: [{ name: "aa.webp" }],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await activerModification(user);
    const ligne = (await dansLArbre("Lieux")).closest("div")!;
    await user.click(within(ligne).getByRole("button", { name: "Options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer" }));

    // Le dossier ET celui de la page qu'il contient : supprimer un dossier
    // emporte sa descendance, donc les images de toute la descendance.
    await waitFor(() => expect(mock.storageList).toHaveBeenCalledTimes(2));
    expect(mock.storageList.mock.calls.map(([dossier]) => dossier)).toEqual([
      "world-w1/page-f1",
      "world-w1/page-p2",
    ]);
    expect(mock.storageRemove).toHaveBeenCalledWith([
      "world-w1/page-f1/aa.webp",
      "world-w1/page-p2/aa.webp",
    ]);
  });
});

describe("WorldWiki — replier la colonne de navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try { localStorage.removeItem("wiki-nav-collapsed:w1"); } catch { /* rien */ }
  });

  it("replie la colonne et laisse de quoi la rouvrir", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit={false} />);

    await dansLArbre("Accueil");
    expect(screen.getByPlaceholderText("Rechercher dans le wiki…")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Replier les pages"));

    // La colonne part avec sa recherche ; le bouton de réouverture prend le
    // relais dans le bandeau du milieu.
    expect(screen.queryByPlaceholderText("Rechercher dans le wiki…")).toBeNull();
    const rouvrir = screen.getByLabelText("Déplier les pages");

    await user.click(rouvrir);
    expect(screen.getByPlaceholderText("Rechercher dans le wiki…")).toBeInTheDocument();
  });
});

describe("WorldWiki — pied de la colonne de navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ne laisse pas de bande vide en lecture", async () => {
    // Le pied ne porte que des commandes d'écriture : hors de ce mode, il ne
    // restait qu'un filet et une bande vide au bas de la colonne.
    setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await dansLArbre("Accueil");
    expect(screen.queryByTestId("wiki-nav-footer")).toBeNull();
  });

  it("le monte dès qu'on passe en modification", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await activerModification(user);

    const pied = await screen.findByTestId("wiki-nav-footer");
    expect(within(pied).getByRole("button", { name: "Page" })).toBeTruthy();
  });
});
