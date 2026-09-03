import { describe, it, expect, vi, afterEach } from "vitest";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

// Le canevas n'existe pas sous jsdom, et la conversion en WebP n'est pas le
// sujet : le reste du module — dont `firstImage`, qui EST le sujet — passe
// tel quel.
vi.mock("@/lib/imageUtils", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/imageUtils")>()),
  toWebP: async (fichier: File) => fichier,
}));

// Le vrai CodeEditor est monté : c'est un <textarea>, donc sélection, curseur
// et raccourcis y sont ceux du navigateur. Seule la coloration est écartée —
// elle charge Shiki et ses grammaires, hors sujet ici et lente.
vi.mock("@/lib/codeHighlighter", () => ({
  highlightCode: () => Promise.reject(new Error("coloration hors test")),
  preloadCodeHighlighter: () => () => {},
}));

// Le vrai rendu produit des paragraphes, et c'est sur eux que porte
// l'ancrage : un simulacre qui rendrait tout le texte d'un bloc ne dirait
// rien du comportement qu'on vérifie ici.
vi.mock("@/components/MarkdownRenderer", () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown">
      {content.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
    </div>
  ),
}));
// Le panneau de notes est monté d'office depuis que la colonne s'ouvre sur son
// onglet ; il lit ses propres tables et décalerait la file de résultats du
// mock. Ces tests portent sur le contenu de la page et ses commentaires : on
// le remplace par un marqueur inerte (il a ses propres tests).
// Les notes sont maintenant chargées par la page — pour annoncer leur nombre
// même panneau fermé. Elles interrogent leurs propres tables et décaleraient
// la file de résultats du mock, qui sert dans l'ordre des appels à `.from()`.
// Ces tests portent sur l'article et ses commentaires : on neutralise.
const etatNotes = vi.hoisted(() => ({ liste: [] as { id: string }[] }));
vi.mock("@/hooks/useWikiPageNotes", () => ({
  useWikiPageNotes: () => ({
    categories: [],
    notes: etatNotes.liste,
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

vi.mock("@/components/worlds/wiki/WikiNotesPanel", () => ({
  WikiNotesPanel: () => <div data-testid="panneau-notes" />,
}));


// Les annotations sont signées par leur auteur : sans utilisateur identifié,
// la RLS refuse l'écriture et l'interface ne propose rien.
// L'article propose désormais « Voir sur la carte » quand une épingle le
// désigne : ce lien a besoin du routeur, et du drapeau qui gouverne la carte.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ world_map: false }),
}));

vi.mock("@/components/providers/CurrentUserProvider", () => ({
  useCurrentUser: () => ({ userId: "u1", username: "caedrik", avatarUrl: null }),
}));

import { WikiPageContent } from "@/components/worlds/wiki/WikiPageContent";
import type { WikiPage } from "@/components/worlds/wiki/WorldWiki";

/** Le champ markdown de l'article, désigné par son nom accessible. */
function champArticle() {
  return screen.findByLabelText("Contenu de l'article");
}

const BASE_PAGE: WikiPage = {
  id: "p1",
  world_id: "w1",
  parent_id: null,
  title: "Accueil",
  slug: "accueil",
  content: null,
  is_folder: false,
  sort_index: 0,
  icon: null,
  is_restricted: false,
  banner_url: null,
  description: null,
  draft_updated_at: null,
  published_at: null,
  deleted_at: null,
};

afterEach(() => {
  vi.useRealTimers();
  dispositionLarge = false;
});
/**
 * Disposition de bureau : les deux colonnes tiennent.
 *
 * Ce n'est plus un point de rupture mais une mesure — `WorldWiki` observe la
 * largeur de la zone et tranche — donc une propriété, que ces tests règlent
 * ici. Elle vaut `false` par défaut, comme `matchMedia` sous jsdom, pour que
 * les tests de la disposition étroite n'aient rien à dire.
 */
let dispositionLarge = false;

/**
 * Fait croire à un écran large : sous jsdom, `matchMedia` répond toujours
 * `false`, et les enfants qui l'interrogent verraient un téléphone.
 */
function ecranLarge(matches = true) {
  dispositionLarge = matches;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("80rem") ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}


// La page lit ses annotations au montage, avant toute action de l'utilisateur.
// Le mock sert ses résultats dans l'ordre des appels à `.from()` : cette
// réponse vide doit donc précéder celles que le test vise réellement.
const SANS_ANNOTATION = { data: [], error: null };

describe("WikiPageContent — brouillon et publication", () => {
  it("reprend le brouillon existant à l'entrée en édition", async () => {
    const mock = createSupabaseMock({
      results: [SANS_ANNOTATION, { data: { draft_content: "Texte en cours" }, error: null }],
    });
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );

    // Le mode modification ouvre l'éditeur : plus de second bouton à cliquer.
    expect(await champArticle()).toHaveValue("Texte en cours");
  });

  it("n'autosauvegarde pas immédiatement après la frappe", async () => {
    const mock = createSupabaseMock({
      results: [SANS_ANNOTATION, { data: { draft_content: "" }, error: null }],
    });
    const user = userEvent.setup();
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );

    await user.type(await champArticle(), "Bonjour");

    // Un seul appel .from() jusqu'ici : le select("draft_content") d'entrée
    // en édition. Le debounce d'autosave (1.8s) n'a pas encore expiré.
    expect(mock.buildersFor("world_wiki_pages")).toHaveLength(1);
  });

  it("autosauvegarde le brouillon après le délai de debounce", async () => {
    const mock = createSupabaseMock({
      results: [
        SANS_ANNOTATION,
        { data: { draft_content: "" }, error: null },
        { data: null, error: null },
      ],
    });
    const onPageUpdated = vi.fn();
    const user = userEvent.setup();
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={onPageUpdated}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );

    await user.type(await champArticle(), "Bonjour monde");

    await waitFor(
      () => {
        const builders = mock.buildersFor("world_wiki_pages");
        expect(builders).toHaveLength(2);
        expect(builders[1].update).toHaveBeenCalledWith(
          expect.objectContaining({ draft_content: "Bonjour monde" }),
        );
      },
      { timeout: 2500 },
    );

    expect(onPageUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });

  it("Publier copie le brouillon vers le contenu publié", async () => {
    const mock = createSupabaseMock({
      results: [
        SANS_ANNOTATION,
        { data: { draft_content: "Brouillon prêt" }, error: null },
        { data: null, error: null },
      ],
    });
    const onPageUpdated = vi.fn();
    const user = userEvent.setup();
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={onPageUpdated}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );

    await champArticle();
    await user.click(screen.getByText("Publier"));

    await waitFor(() => {
      const builders = mock.buildersFor("world_wiki_pages");
      expect(builders[1].update).toHaveBeenCalledWith(
        expect.objectContaining({ content: "Brouillon prêt", draft_content: "Brouillon prêt" }),
      );
    });
    expect(onPageUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", content: "Brouillon prêt" }),
    );
  });

  it("l'aperçu remplace la saisie au lieu de la flanquer", async () => {
    // Deux colonnes côte à côte n'en font aucune de lisible sur un téléphone :
    // on regarde le résultat, puis on revient écrire.
    const mock = createSupabaseMock({
      results: [SANS_ANNOTATION, { data: { draft_content: "Un texte" }, error: null }],
    });
    const user = userEvent.setup();
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );

    await champArticle();
    await user.click(screen.getByRole("button", { name: /Aperçu/ }));

    expect(screen.getByTestId("markdown")).toBeTruthy();
    expect(screen.queryByLabelText("Contenu de l'article")).toBeNull();

    // Et l'on revient écrire par le même bouton.
    await user.click(screen.getByRole("button", { name: /Aperçu/ }));
    expect(await champArticle()).toBeTruthy();
  });

  it("relâche la bascule du wiki en publiant", async () => {
    // Le mode modification EST l'édition de l'article : refermer l'éditeur en
    // laissant la bascule allumée montrait la page en lecture sous un bouton
    // « Modifier » actif, état d'où l'on ne sortait qu'en le basculant deux fois.
    const onExitEditMode = vi.fn();
    const mock = createSupabaseMock({
      results: [
        SANS_ANNOTATION,
        { data: { draft_content: "Brouillon prêt" }, error: null },
        { data: null, error: null },
      ],
    });
    const user = userEvent.setup();
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={onExitEditMode}
        pageCount={3}
        onRename={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );

    await champArticle();
    await user.click(screen.getByText("Publier"));

    await waitFor(() => expect(onExitEditMode).toHaveBeenCalledTimes(1));
  });

  it("la relâche aussi quand on annule", async () => {
    const onExitEditMode = vi.fn();
    const mock = createSupabaseMock({
      results: [SANS_ANNOTATION, { data: { draft_content: "Peu importe" }, error: null }],
    });
    const user = userEvent.setup();
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={onExitEditMode}
        pageCount={3}
        onRename={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );

    await champArticle();
    await user.click(screen.getByText("Annuler"));

    expect(onExitEditMode).toHaveBeenCalledTimes(1);
  });
});

describe("WikiPageContent — badge brouillon", () => {
  it("affiche le badge quand un brouillon plus récent que la publication existe", () => {
    const mock = createSupabaseMock({});
    const page: WikiPage = {
      ...BASE_PAGE,
      content: "Publié",
      published_at: "2026-01-01T00:00:00.000Z",
      draft_updated_at: "2026-01-02T00:00:00.000Z",
    };
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={page}
        pages={[page]}
        canEdit
        isEditMode={false}
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
    expect(screen.getByText("Brouillon")).toBeInTheDocument();
  });

  it("n'affiche pas le badge pour un lecteur sans droit d'édition", () => {
    const mock = createSupabaseMock({});
    const page: WikiPage = {
      ...BASE_PAGE,
      content: "Publié",
      published_at: "2026-01-01T00:00:00.000Z",
      draft_updated_at: "2026-01-02T00:00:00.000Z",
    };
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={page}
        pages={[page]}
        canEdit={false}
        isEditMode={false}
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
    expect(screen.queryByText("Brouillon")).not.toBeInTheDocument();
  });

  it("n'affiche pas le badge quand le contenu publié est plus récent que le brouillon", () => {
    const mock = createSupabaseMock({});
    const page: WikiPage = {
      ...BASE_PAGE,
      content: "Publié",
      published_at: "2026-01-02T00:00:00.000Z",
      draft_updated_at: "2026-01-01T00:00:00.000Z",
    };
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={page}
        pages={[page]}
        canEdit
        isEditMode={false}
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
    expect(screen.queryByText("Brouillon")).not.toBeInTheDocument();
  });
});

describe("WikiPageContent — badge page restreinte", () => {
  it("affiche le badge quand la page est réservée aux éditeurs", () => {
    const mock = createSupabaseMock({});
    const page: WikiPage = { ...BASE_PAGE, content: "Publié", is_restricted: true };
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={page}
        pages={[page]}
        canEdit
        isEditMode={false}
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
    expect(screen.getByText("Réservé aux éditeurs")).toBeInTheDocument();
  });

  it("n'affiche pas le badge pour une page non restreinte", () => {
    const mock = createSupabaseMock({});
    const page: WikiPage = { ...BASE_PAGE, content: "Publié", is_restricted: false };
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={page}
        pages={[page]}
        canEdit
        isEditMode={false}
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
    expect(screen.queryByText("Réservé aux éditeurs")).not.toBeInTheDocument();
  });
});

describe("WikiPageContent — titre de la page", () => {
  it("rend le titre modifiable d'emblée en modification de l'article", async () => {
    // On y écrit déjà le corps : exiger un geste de plus pour le titre — un
    // menu, une entrée « Renommer » — n'aurait servi à rien.
    const mock = createSupabaseMock({
      results: [SANS_ANNOTATION, { data: { draft_content: "Texte" }, error: null }],
    });
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={onRename}
        page={{ ...BASE_PAGE, content: "Publié" }}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );

    const champ = await screen.findByDisplayValue("Accueil");

    await user.clear(champ);
    await user.type(champ, "Nouveau titre");
    await user.tab();

    expect(onRename).toHaveBeenCalledWith("Nouveau titre", "");
  });

  it("ne renomme pas quand le titre sort inchangé du champ", async () => {
    const mock = createSupabaseMock({
      results: [SANS_ANNOTATION, { data: { draft_content: "Texte" }, error: null }],
    });
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={onRename}
        page={{ ...BASE_PAGE, content: "Publié" }}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );

    await screen.findByDisplayValue("Accueil");
    await user.tab();

    expect(onRename).not.toHaveBeenCalled();
  });
});

describe("WikiPageContent — commentaires ancrés", () => {
  const PAGE: WikiPage = {
    ...BASE_PAGE,
    content: ["Mara Kline observe la ville.", "Les Gardiens veillent sur Meridian."].join("\n\n"),
  };

  function renderPage(mock: ReturnType<typeof createSupabaseMock>, canEdit = true) {
    return render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={PAGE}
        pages={[PAGE]}
        canEdit={canEdit}
        isEditMode={false}
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
  }

  const ANNOTATION = {
    id: "a1",
    page_id: "p1",
    parent_id: null,
    author_id: "u1",
    body: "Qui les a créés ?",
    anchor_block_type: "p",
    anchor_quote: "Les Gardiens veillent sur Meridian.",
    anchor_prefix: "Mara Kline observe la ville.",
    anchor_suffix: "",
    anchor_start: 1,
    resolved_at: null,
    resolved_by: null,
    created_at: "2026-08-01T10:00:00.000Z",
    author: { id: "u1", username: "caedrik", avatar_url: null },
  };

  /** La commande « Commenter » du bloc d'index donné, dans la marge. */
  async function boutonDuBloc(i: number) {
    return (await screen.findAllByRole("button", { name: "Commenter" }))[i];
  }

  it("lit les annotations avec la page, sans attendre l'ouverture du panneau", async () => {
    // Les surlignages sont le seul indice qu'une page est commentée : les
    // charger à la demande les rendrait invisibles à qui n'ouvre pas le
    // panneau.
    const mock = createSupabaseMock({ results: [{ data: [], error: null }] });
    renderPage(mock);

    await waitFor(() =>
      expect(mock.client.from).toHaveBeenCalledWith("world_wiki_page_annotations"),
    );
  });

  it("compte les fils ouverts sur l'onglet des commentaires", async () => {
    ecranLarge();
    const mock = createSupabaseMock({
      results: [{
        data: [
          { ...ANNOTATION, id: "a1" },
          { ...ANNOTATION, id: "a2", resolved_at: "2026-08-02T10:00:00.000Z", resolved_by: "u1" },
        ],
        error: null,
      }],
    });
    renderPage(mock);

    const onglet = await screen.findByRole("tab", { name: /Commentaires/ });
    await waitFor(() => expect(onglet.textContent).toContain("1"));
  });

  it("marque le bloc commenté et ouvre le fil au clic", async () => {
    ecranLarge();
    const mock = createSupabaseMock({
      results: [{ data: [ANNOTATION], error: null }],
    });
    const { container } = renderPage(mock);

    // La colonne s'ouvre sur les notes : on bascule sur les commentaires.
    await userEvent.click(await screen.findByRole("tab", { name: /Commentaires/ }));
    await waitFor(() => expect(screen.getByText("Qui les a créés ?")).toBeTruthy());

    const marque = container.querySelector<HTMLElement>('[data-annotation-ids~="a1"]');
    expect(marque).toBe(container.querySelectorAll("p")[1]);
    // Le texte de la page reste intact : on ne pose que des attributs.
    expect(marque!.textContent).toBe("Les Gardiens veillent sur Meridian.");
  });

  it("déplie la colonne repliée pour montrer la saisie", async () => {
    // Le tiroir seul ne suffisait pas : son ouverture est conditionnée à
    // l'absence de colonne. À grande largeur, colonne repliée, la saisie
    // s'ouvrait donc hors de vue.
    ecranLarge();
    // `localStorage` de l'environnement de test n'a pas de `setItem` : on
    // fournit le magasin que la colonne interroge, plutôt que d'y écrire.
    const vrai = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (cle: string) => (cle === "wiki-side-collapsed:w1" ? "1" : null),
        setItem: () => {},
        removeItem: () => {},
      },
    });
    try {
      const mock = createSupabaseMock({ results: [{ data: [], error: null }] });
      const user = userEvent.setup();
      renderPage(mock);

      await screen.findByTestId("markdown");
      expect(screen.queryByRole("complementary")).toBeNull();

      await user.click(await boutonDuBloc(1));

      expect(screen.getByRole("complementary", { name: "Commentaires" })).toBeTruthy();
    } finally {
      if (vrai) Object.defineProperty(window, "localStorage", vrai);
    }
  });

  it("ouvre la saisie sur le bloc de sa commande, texte à l'appui", async () => {
    ecranLarge();
    const mock = createSupabaseMock({ results: [{ data: [], error: null }] });
    const user = userEvent.setup();
    renderPage(mock);

    await screen.findByTestId("markdown");
    await user.click(await boutonDuBloc(1));

    // Le panneau s'ouvre de lui-même sur la saisie, et rappelle le bloc visé.
    const panel = screen.getByRole("complementary", { name: "Commentaires" });
    expect(panel.textContent).toContain("Les Gardiens veillent sur Meridian.");
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});

describe("WikiPageContent — colonne latérale en mode modification", () => {
  function renderPage(isEditMode: boolean) {
    const mock = createSupabaseMock({
      results: [SANS_ANNOTATION, { data: { draft_content: "Texte en cours" }, error: null }],
    });
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={{ ...BASE_PAGE, content: "Un texte." }}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode={isEditMode}
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
  }

  it("garde les notes atteignables pendant qu'on édite l'article", async () => {
    // Le mode modification ouvre l'éditeur ET conditionne seul l'ajout de
    // fiches : si la colonne disparaît en édition, plus rien ne permet de les
    // modifier. La vue d'édition sortait par un `return` anticipé, placé avant
    // la colonne — d'où sa disparition.
    ecranLarge();
    renderPage(true);

    expect(await champArticle()).toBeTruthy();
    expect(screen.getByTestId("panneau-notes")).toBeTruthy();
  });

  it("garde la colonne en lecture", async () => {
    ecranLarge();
    renderPage(false);

    expect(await screen.findByTestId("panneau-notes")).toBeTruthy();
    expect(screen.queryByLabelText("Contenu de l'article")).toBeNull();
  });
});

describe("WikiPageContent — images collées dans l'article", () => {
  function renderEnEdition() {
    const mock = createSupabaseMock({
      // Sans utilisateur, le chemin de stockage n'a pas de dossier où écrire
      // et l'envoi s'arrête avant d'avoir commencé.
      user: { id: "u1" },
      results: [SANS_ANNOTATION, { data: { draft_content: "Voici " }, error: null }],
    });
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={1}
        onRename={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
  }

  /** Un presse-papiers qui porte une image, comme après une capture d'écran. */
  function pressePapiersAvecImage() {
    const image = new File(["x"], "capture.png", { type: "image/png" });
    return {
      items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
      files: [image],
    };
  }

  async function champPret() {
    const champ = (await champArticle()) as HTMLTextAreaElement;
    await waitFor(() => expect(champ).toHaveValue("Voici "));
    champ.focus();
    champ.setSelectionRange(champ.value.length, champ.value.length);
    return champ;
  }

  it("envoie l'image et l'écrit à l'endroit du curseur", async () => {
    renderEnEdition();
    const champ = await champPret();

    fireEvent.paste(champ, { clipboardData: pressePapiersAvecImage() });

    await waitFor(() => expect(champ.value).toMatch(MARKDOWN_IMAGE));
  });

  it("laisse passer un collage qui n'est pas une image", async () => {
    // Coller du texte doit rester l'affaire du navigateur : l'intercepter,
    // c'est le casser.
    renderEnEdition();
    const champ = await champPret();

    const evenement = createEvent.paste(champ, {
      clipboardData: { items: [{ kind: "string", type: "text/plain" }], files: [] },
    });
    fireEvent(champ, evenement);

    expect(evenement.defaultPrevented).toBe(false);
  });
});

const MARKDOWN_IMAGE = new RegExp(String.raw`^Voici !\[\]\(https://\S+\)$`);

describe("WikiPageContent — autocomplétion des liens internes", () => {
  const ARKHAM: WikiPage = {
    ...BASE_PAGE, id: "p2", title: "Arkham", slug: "arkham",
    content: ["## Le port", "", "## Les ruelles"].join("\n"),
  };
  const ASILE: WikiPage = { ...BASE_PAGE, id: "p3", title: "Arkham Asylum", slug: "asile" };

  function renderEnEdition(brouillon = "On va à ") {
    const mock = createSupabaseMock({
      results: [SANS_ANNOTATION, { data: { draft_content: brouillon }, error: null }],
    });
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE, ARKHAM, ASILE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
  }

  /**
   * Place le curseur au bout du brouillon et y tape `saisie`, telle quelle.
   *
   * `userEvent` réserve `[` et `{` à ses descripteurs de touches — un `[[`
   * tapé naïvement n'arrive jamais dans le champ. Les doubler les rend
   * littéraux, et le test peut s'écrire comme on parle.
   */
  async function taper(saisie: string) {
    const champ = (await champArticle()) as HTMLTextAreaElement;
    await waitFor(() => expect(champ).toHaveValue("On va à "));
    champ.focus();
    champ.setSelectionRange(champ.value.length, champ.value.length);
    await userEvent.type(champ, saisie.replace(/[[{]/g, c => c + c));
    return champ;
  }

  it("propose les pages dès qu'un lien s'ouvre", async () => {
    renderEnEdition();
    await taper("[[Ark");

    const proposees = await screen.findAllByRole("option");
    expect(proposees.map(o => o.textContent)).toEqual(["Arkham", "Arkham Asylum"]);
  });

  it("propose les sections de la page dès le `#`", async () => {
    // Sans cela il fallait connaître le titre exact de la section et
    // l'orthographier juste — ce que la liste avait justement supprimé pour
    // les pages.
    renderEnEdition();
    await taper("[[Arkham#");

    const proposees = await screen.findAllByRole("option");
    expect(proposees.map(o => o.textContent)).toEqual(["Le port", "Les ruelles"]);
  });

  it("écrit la page ET sa section quand on en choisit une", async () => {
    renderEnEdition();
    const champ = await taper("[[Arkham#ruel");
    await screen.findAllByRole("option");

    await userEvent.keyboard("{Enter}");

    expect(champ).toHaveValue("On va à [[Arkham#Les ruelles]]");
  });

  it("écrit le titre choisi et ferme le lien sur Entrée", async () => {
    renderEnEdition();
    const champ = await taper("[[Ark");
    await screen.findAllByRole("option");

    await userEvent.keyboard("{Enter}");

    expect(champ).toHaveValue("On va à [[Arkham]]");
  });

  it("les flèches changent la page retenue", async () => {
    renderEnEdition();
    const champ = await taper("[[Ark");
    await screen.findAllByRole("option");

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(champ).toHaveValue("On va à [[Arkham Asylum]]");
  });

  it("Échap referme la liste sans rien écrire", async () => {
    renderEnEdition();
    const champ = await taper("[[Ark");
    await screen.findAllByRole("option");

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("option")).toBeNull();
    expect(champ).toHaveValue("On va à [[Ark");
  });

  it("se referme quand plus aucune page ne correspond", async () => {
    renderEnEdition();
    await taper("[[Zzz");

    expect(screen.queryByRole("option")).toBeNull();
  });

  it("laisse Entrée à la ligne quand aucune liste n'est ouverte", async () => {
    // La liste s'approprie Entrée : elle ne doit le faire QUE tant qu'elle est
    // là, sinon on ne peut plus passer à la ligne.
    renderEnEdition();
    const champ = await taper("Arkham");

    await userEvent.keyboard("{Enter}");

    expect(champ).toHaveValue(`On va à Arkham
`);
  });
});

describe("WikiPageContent — ceinture de mise en forme", () => {
  function renderEnEdition() {
    const mock = createSupabaseMock({
      results: [SANS_ANNOTATION, { data: { draft_content: "Un mot ici" }, error: null }],
    });
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
  }

  /** Sélectionne « mot » dans « Un mot ici ». */
  async function champAvecMotSelectionne() {
    const champ = (await champArticle()) as HTMLTextAreaElement;
    await waitFor(() => expect(champ).toHaveValue("Un mot ici"));
    champ.focus();
    champ.setSelectionRange(3, 6);
    return champ;
  }

  it("met en gras la sélection depuis un bouton", async () => {
    renderEnEdition();
    const champ = await champAvecMotSelectionne();

    await userEvent.click(screen.getByRole("button", { name: "Gras" }));

    expect(champ).toHaveValue("Un **mot** ici");
  });

  it("laisse dehors l'espace emporté par un double-clic", async () => {
    // Le geste le plus courant : double-cliquer un mot — ce qui sélectionne
    // l'espace qui le suit — puis cliquer « Gras ». `**mot **` n'étant pas du
    // gras pour CommonMark, les étoiles restaient affichées telles quelles et
    // rien ne changeait à l'écran.
    renderEnEdition();
    const champ = (await champArticle()) as HTMLTextAreaElement;
    await waitFor(() => expect(champ).toHaveValue("Un mot ici"));
    champ.focus();
    champ.setSelectionRange(3, 7);

    await userEvent.click(screen.getByRole("button", { name: "Gras" }));

    expect(champ).toHaveValue("Un **mot** ici");
  });

  it("garde la sélection même si le champ l'a repliée entre-temps", async () => {
    // Entre le geste de l'utilisateur et le clic sur le bouton, il suffit que
    // quelque chose réécrive la valeur du champ pour que le navigateur replie
    // le curseur — sans que `select` en dise rien. La ceinture encadrait alors
    // le vide au lieu du texte choisi.
    renderEnEdition();
    const champ = (await champArticle()) as HTMLTextAreaElement;
    await waitFor(() => expect(champ).toHaveValue("Un mot ici"));
    champ.focus();
    champ.setSelectionRange(3, 6);
    fireEvent.select(champ);
    // Le repliement, tel que le navigateur le produit : sans événement.
    champ.selectionStart = 0;
    champ.selectionEnd = 0;

    await userEvent.click(screen.getByRole("button", { name: "Gras" }));

    expect(champ).toHaveValue("Un **mot** ici");
  });

  it("oublie la sélection dès que l'utilisateur repose son curseur", async () => {
    // Le revers de la retenue : reposer le curseur ailleurs doit compter. Sans
    // cela, la ceinture irait rhabiller un mot que l'utilisateur a quitté.
    renderEnEdition();
    const champ = (await champArticle()) as HTMLTextAreaElement;
    await waitFor(() => expect(champ).toHaveValue("Un mot ici"));
    champ.focus();
    champ.setSelectionRange(3, 6);
    fireEvent.select(champ);

    fireEvent.mouseDown(champ);
    champ.setSelectionRange(10, 10);
    fireEvent.select(champ);
    await userEvent.click(screen.getByRole("button", { name: "Gras" }));

    expect(champ).toHaveValue("Un mot ici****");
  });

  it("laisse la sélection sur le mot, prête pour un second format", async () => {
    // Sans cela, enchaîner gras puis italique appliquerait le second au vide.
    renderEnEdition();
    const champ = await champAvecMotSelectionne();

    await userEvent.click(screen.getByRole("button", { name: "Gras" }));
    await waitFor(() => expect(champ.selectionStart).toBe(5));
    await userEvent.click(screen.getByRole("button", { name: "Italique" }));

    expect(champ).toHaveValue("Un ***mot*** ici");
  });

  it("pose un titre depuis le menu des titres", async () => {
    // Le menu passe par Radix, qui rend le focus au déclencheur en se
    // fermant : la sélection reposée doit survivre à ce retour.
    renderEnEdition();
    const champ = await champAvecMotSelectionne();

    await userEvent.click(screen.getByRole("button", { name: "Titre" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Titre 2/ }));

    await waitFor(() => expect(champ).toHaveValue("## Un mot ici"));
  });

  it("répond aussi au raccourci clavier", async () => {
    renderEnEdition();
    const champ = await champAvecMotSelectionne();

    fireEvent.keyDown(champ, { key: "b", code: "KeyB", ctrlKey: true });

    await waitFor(() => expect(champ).toHaveValue("Un **mot** ici"));
  });

  it("écrit par le navigateur quand il sait annuler, pas par l'état", async () => {
    // La pile d'annulation native est vidée dès qu'on pose `value` sur le
    // nœud : une mise en forme écrite par React ne serait pas défaisable au
    // Ctrl+Z, ni ce qui a été tapé avant elle. On simule ici le navigateur —
    // jsdom n'a pas `execCommand`.
    const commandes: unknown[][] = [];
    const poser = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    (document as unknown as { execCommand: unknown }).execCommand = (
      ...args: unknown[]
    ) => {
      commandes.push(args);
      const el = document.activeElement as HTMLTextAreaElement;
      const insere = (args[2] as string | undefined) ?? "";
      poser.call(
        el,
        el.value.slice(0, el.selectionStart) + insere + el.value.slice(el.selectionEnd),
      );
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    };

    try {
      renderEnEdition();
      const champ = await champAvecMotSelectionne();

      await userEvent.click(screen.getByRole("button", { name: "Gras" }));

      expect(commandes).toEqual([["insertText", false, "**mot**"]]);
      expect(champ).toHaveValue("Un **mot** ici");
    } finally {
      delete (document as { execCommand?: unknown }).execCommand;
    }
  });

  it("ne montre la ceinture qu'en écriture", async () => {
    // En lecture, la place revient au fil d'Ariane.
    const mock = createSupabaseMock({ results: [SANS_ANNOTATION] });
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={{ ...BASE_PAGE, content: "Un texte." }}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode={false}
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );

    await screen.findByTestId("markdown");
    expect(screen.queryByRole("toolbar", { name: "Mise en forme" })).toBeNull();
  });
});

describe("WikiPageContent — compteurs du sous-en-tête", () => {
  function renderPage() {
    const mock = createSupabaseMock({ results: [SANS_ANNOTATION] });
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={{ ...BASE_PAGE, content: "Un texte." }}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode={false}
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
  }

  afterEach(() => {
    etatNotes.liste = [];
  });

  it("annonce le nombre de pages sur le bouton qui ouvre l'arbre", async () => {
    // Fermée, la colonne ne dit plus rien de ce qu'elle contient : le bouton
    // le dit à sa place.
    renderPage();

    const bouton = await screen.findByRole("button", { name: "Ouvrir les pages" });
    expect(bouton.textContent!.trim()).toBe("Pages3");
  });

  it("annonce le nombre de fiches sur le bouton des notes", async () => {
    etatNotes.liste = [{ id: "n1" }, { id: "n2" }];
    renderPage();

    const boutons = await screen.findAllByText("Notes");
    expect(boutons[0].closest("button")!.textContent).toBe("Notes2");
  });

  it("ne compte rien quand il n'y a rien à compter", async () => {
    renderPage();

    await screen.findByTestId("markdown");
    const boutons = screen.getAllByText("Notes");
    expect(boutons[0].closest("button")!.textContent).toBe("Notes");
  });
});

describe("WikiPageContent — bannière et description", () => {
  const AVEC_CHAPEAU: WikiPage = {
    ...BASE_PAGE,
    content: "Un texte.",
    // Forme d'une URL du stockage Supabase : c'est elle qui autorise la
    // vignette floutée, `supabaseTinyThumb` ne sachant rien faire d'une autre.
    banner_url: "https://exemple.test/storage/v1/object/public/worlds/banniere.webp",
    description: "Une ville gouvernée par des machines.",
  };

  function renderPage(page: WikiPage, isEditMode = false) {
    const mock = createSupabaseMock({
      results: isEditMode
        ? [SANS_ANNOTATION, { data: { draft_content: "Un texte." }, error: null }, { data: null, error: null }]
        : [SANS_ANNOTATION],
    });
    const vue = render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        colonneLaterale={dispositionLarge}
        navEnColonne={dispositionLarge}
        panelHandleProps={{}}
        navCollapsed={false}
        onExpandNav={vi.fn()}
        onOpenTree={vi.fn()}
        onExitEditMode={vi.fn()}
        pageCount={3}
        onRename={vi.fn()}
        page={page}
        pages={[page]}
        canEdit
        isEditMode={isEditMode}
        supabase={mock.client as never}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        pendingAnchor={null}
        onAnchorReached={vi.fn()}
        noteToOpen={null}
        onNoteOpened={vi.fn()}
        onNotesLoaded={vi.fn()}
      />,
    );
    return { ...vue, mock };
  }

  it("pose le titre et le chapeau SUR la bannière", async () => {
    const { container } = renderPage(AVEC_CHAPEAU);

    await screen.findByTestId("markdown");
    const image = container.querySelector("img")!;
    expect(image.getAttribute("src")).toContain("banniere.webp");

    // Le titre partage le cadre de l'image, il ne la suit pas : c'est ce qui
    // fait la différence entre un en-tête et une simple illustration.
    const cadre = image.closest("div")!;
    expect(within(cadre).getByRole("heading", { name: "Accueil" })).toBeTruthy();
    expect(within(cadre).getByText("Une ville gouvernée par des machines.")).toBeTruthy();
  });

  it("tient la place avec une vignette floutée le temps du chargement", async () => {
    // Une bannière pèse lourd et ouvre la page : c'est là que l'attente se
    // voit le plus. Le substitut est la vraie image, en quelques pixels.
    const { container } = renderPage(AVEC_CHAPEAU);

    await screen.findByTestId("markdown");
    expect(container.querySelector('[data-testid="stored-image-blur"]')).not.toBeNull();
  });

  it("rend l'en-tête à la colonne de texte quand il n'y a pas de bannière", async () => {
    const { container } = renderPage({ ...BASE_PAGE, content: "Un texte.", description: "Un chapeau." });

    await screen.findByTestId("markdown");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("heading", { name: "Accueil" })).toBeTruthy();
    expect(screen.getByText("Un chapeau.")).toBeTruthy();
  });

  it("n'affiche rien de tout cela quand la page n'en a pas", async () => {
    const { container } = renderPage({ ...BASE_PAGE, content: "Un texte." });

    await screen.findByTestId("markdown");
    expect(container.querySelector("img")).toBeNull();
  });

  it("propose d'ajouter une bannière en écriture, et de la retirer ensuite", async () => {
    renderPage({ ...BASE_PAGE, content: "Un texte." }, true);
    expect(await screen.findByRole("button", { name: /Ajouter une bannière/ })).toBeTruthy();

    renderPage(AVEC_CHAPEAU, true);
    expect(await screen.findByRole("button", { name: "Retirer la bannière" })).toBeTruthy();
  });

  it("propose de recadrer avant d'envoyer, jamais d'envoyer tel quel", async () => {
    // Une bannière est un bandeau très large : une photo verticale y serait
    // rognée par le navigateur sans que personne ne décide où.
    const user = userEvent.setup();
    const { container } = renderPage({ ...BASE_PAGE, content: "Un texte." }, true);
    await screen.findByRole("button", { name: /Ajouter une bannière/ });

    const champ = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(champ, new File(["x"], "photo.png", { type: "image/png" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Recadrer la bannière")).toBeTruthy();
  });

  it("borne le chapeau à 255 caractères", async () => {
    // La borne vit aussi en base (migration 143) : celle-ci évite d'aller s'y
    // faire refuser après coup.
    renderPage(AVEC_CHAPEAU, true);

    const champ = await screen.findByLabelText("Description de la page");
    expect(champ.getAttribute("maxlength")).toBe("255");
  });

  it("enregistre le chapeau en quittant le champ", async () => {
    const user = userEvent.setup();
    const { mock } = renderPage(AVEC_CHAPEAU, true);

    const champ = await screen.findByLabelText("Description de la page");
    await user.clear(champ);
    await user.type(champ, "Une autre phrase.");
    await user.tab();

    await waitFor(() => {
      const ecritures = mock.buildersFor("world_wiki_pages")
        .flatMap(b => b.update.mock.calls.map(c => c[0]));
      expect(ecritures).toContainEqual({ description: "Une autre phrase." });
    });
  });
});
