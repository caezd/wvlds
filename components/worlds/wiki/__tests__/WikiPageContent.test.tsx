import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("WikiPageContent — brouillon et publication", () => {
  it("reprend le brouillon existant à l'entrée en édition", async () => {
    const mock = createSupabaseMock({
      results: [{ data: { draft_content: "Texte en cours" }, error: null }],
    });
    const user = userEvent.setup();
    render(
      <WikiPageContent
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
      results: [{ data: { draft_content: "" }, error: null }],
    });
    const user = userEvent.setup();
    render(
      <WikiPageContent
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
        { data: { draft_content: "" }, error: null },
        { data: null, error: null },
      ],
    });
    const onPageUpdated = vi.fn();
    const user = userEvent.setup();
    render(
      <WikiPageContent
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
        { data: { draft_content: "Brouillon prêt" }, error: null },
        { data: null, error: null },
      ],
    });
    const onPageUpdated = vi.fn();
    const user = userEvent.setup();
    render(
      <WikiPageContent
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
