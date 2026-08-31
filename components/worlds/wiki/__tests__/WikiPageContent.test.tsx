import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

// ParagraphBlockEditor remplacé par un <textarea> contrôlé — mêmes raisons
// que components/__tests__/ChatroomComposerDraft.test.tsx (manipulations
// contenteditable non fiables sous jsdom).
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea data-testid="editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/components/MarkdownRenderer", () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));
// Le panneau de notes est monté d'office depuis que la colonne s'ouvre sur son
// onglet ; il lit ses propres tables et décalerait la file de résultats du
// mock. Ces tests portent sur le contenu de la page et ses commentaires : on
// le remplace par un marqueur inerte (il a ses propres tests).
vi.mock("@/components/worlds/wiki/WikiNotesPanel", () => ({
  WikiNotesPanel: () => <div data-testid="panneau-notes" />,
}));


// Les annotations sont signées par leur auteur : sans utilisateur identifié,
// la RLS refuse l'écriture et l'interface ne propose rien.
vi.mock("@/components/providers/CurrentUserProvider", () => ({
  useCurrentUser: () => ({ userId: "u1", username: "caedrik", avatarUrl: null }),
}));

import { WikiPageContent } from "@/components/worlds/wiki/WikiPageContent";
import type { WikiPage } from "@/components/worlds/wiki/WorldWiki";

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
  draft_updated_at: null,
  published_at: null,
};

afterEach(() => {
  vi.useRealTimers();
});
/**
 * Fait croire à un écran large : sous jsdom, `matchMedia` répond toujours
 * `false`, et la colonne latérale — montée seulement à partir de `xl` — serait
 * absente de tous ces tests, qui portent sur la disposition de bureau.
 */
function ecranLarge(matches = true) {
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
    const user = userEvent.setup();
    render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        panelHandleProps={{}}
        editMode={true}
        onToggleEditMode={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        ancestors={[]}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        onExpandFolder={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Modifier"));

    expect(await screen.findByTestId("editor")).toHaveValue("Texte en cours");
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
        panelHandleProps={{}}
        editMode={true}
        onToggleEditMode={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        ancestors={[]}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        onExpandFolder={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Modifier"));
    await user.type(await screen.findByTestId("editor"), "Bonjour");

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
        panelHandleProps={{}}
        editMode={true}
        onToggleEditMode={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        ancestors={[]}
        onPageUpdated={onPageUpdated}
        onNavigate={vi.fn()}
        onExpandFolder={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Modifier"));
    await user.type(await screen.findByTestId("editor"), "Bonjour monde");

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
        panelHandleProps={{}}
        editMode={true}
        onToggleEditMode={vi.fn()}
        page={BASE_PAGE}
        pages={[BASE_PAGE]}
        canEdit
        isEditMode
        supabase={mock.client as never}
        ancestors={[]}
        onPageUpdated={onPageUpdated}
        onNavigate={vi.fn()}
        onExpandFolder={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Modifier"));
    await screen.findByTestId("editor");
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
        panelHandleProps={{}}
        editMode={false}
        onToggleEditMode={vi.fn()}
        page={page}
        pages={[page]}
        canEdit
        isEditMode={false}
        supabase={mock.client as never}
        ancestors={[]}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        onExpandFolder={vi.fn()}
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
        panelHandleProps={{}}
        editMode={false}
        onToggleEditMode={vi.fn()}
        page={page}
        pages={[page]}
        canEdit={false}
        isEditMode={false}
        supabase={mock.client as never}
        ancestors={[]}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        onExpandFolder={vi.fn()}
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
        panelHandleProps={{}}
        editMode={false}
        onToggleEditMode={vi.fn()}
        page={page}
        pages={[page]}
        canEdit
        isEditMode={false}
        supabase={mock.client as never}
        ancestors={[]}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        onExpandFolder={vi.fn()}
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
        panelHandleProps={{}}
        editMode={false}
        onToggleEditMode={vi.fn()}
        page={page}
        pages={[page]}
        canEdit
        isEditMode={false}
        supabase={mock.client as never}
        ancestors={[]}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        onExpandFolder={vi.fn()}
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
        panelHandleProps={{}}
        editMode={false}
        onToggleEditMode={vi.fn()}
        page={page}
        pages={[page]}
        canEdit
        isEditMode={false}
        supabase={mock.client as never}
        ancestors={[]}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        onExpandFolder={vi.fn()}
      />,
    );
    expect(screen.queryByText("Réservé aux éditeurs")).not.toBeInTheDocument();
  });
});

describe("WikiPageContent — commentaires ancrés", () => {
  const PAGE: WikiPage = {
    ...BASE_PAGE,
    content: "Mara Kline observe la ville. Les Gardiens veillent sur Meridian.",
  };

  function renderPage(mock: ReturnType<typeof createSupabaseMock>, canEdit = true) {
    return render(
      <WikiPageContent
        worldId="w1"
        panelWidth={320}
        panelHandleProps={{}}
        editMode={false}
        onToggleEditMode={vi.fn()}
        page={PAGE}
        pages={[PAGE]}
        canEdit={canEdit}
        isEditMode={false}
        supabase={mock.client as never}
        ancestors={[]}
        onPageUpdated={vi.fn()}
        onNavigate={vi.fn()}
        onExpandFolder={vi.fn()}
      />,
    );
  }

  const ANNOTATION = {
    id: "a1",
    page_id: "p1",
    parent_id: null,
    author_id: "u1",
    body: "Qui les a créés ?",
    anchor_quote: "Les Gardiens",
    anchor_prefix: "Mara Kline observe la ville. ",
    anchor_suffix: " veillent sur Meridian.",
    anchor_start: 28,
    resolved_at: null,
    resolved_by: null,
    created_at: "2026-08-01T10:00:00.000Z",
    author: { id: "u1", username: "caedrik", avatar_url: null },
  };

  /** Sélectionne un passage dans le texte rendu, puis relâche la souris. */
  function selectInProse(quote: string) {
    const prose = screen.getByTestId("markdown");
    const node = prose.firstChild as Text;
    const start = node.nodeValue!.indexOf(quote);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + quote.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.mouseUp(prose);
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

  it("surligne les passages annotés et ouvre le fil au clic", async () => {
    ecranLarge();
    const mock = createSupabaseMock({
      results: [{ data: [ANNOTATION], error: null }],
    });
    const { container } = renderPage(mock);

    // La colonne s'ouvre sur les notes : on bascule sur les commentaires.
    await userEvent.click(await screen.findByRole("tab", { name: /Commentaires/ }));
    await waitFor(() => expect(screen.getByText("Qui les a créés ?")).toBeTruthy());

    const mark = container.querySelector<HTMLElement>('[data-annotation-id="a1"]');
    expect(mark!.textContent).toBe("Les Gardiens");
    // Le texte de la page reste intact malgré l'enveloppement.
    expect(screen.getByTestId("markdown").textContent).toBe(PAGE.content);
  });

  it("ouvre la saisie sur le passage sélectionné, extrait à l'appui", async () => {
    const mock = createSupabaseMock({ results: [{ data: [], error: null }] });
    const user = userEvent.setup();
    renderPage(mock);

    selectInProse("Les Gardiens");
    await user.click(await screen.findByRole("button", { name: "Commenter" }));

    // Le panneau s'ouvre de lui-même sur la saisie, et rappelle l'extrait visé.
    const panel = screen.getByRole("complementary", { name: "Commentaires" });
    expect(panel.textContent).toContain("Les Gardiens");
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});
