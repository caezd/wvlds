import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/app/(protected)/w/actions", () => ({ saveWorldPrefs: vi.fn() }));

const pbeProps = vi.fn();
vi.mock("@/components/chatrooms/composer/ParagraphBlockEditor", () => ({
  ParagraphBlockEditor: (props: Record<string, unknown>) => {
    pbeProps(props);
    return <div data-testid="pbe" />;
  },
}));

const mdProps = vi.fn();
vi.mock("@/components/MarkdownRenderer", () => ({
  default: (props: Record<string, unknown>) => {
    mdProps(props);
    return <div data-testid="markdown" />;
  },
}));

import { WorldWiki } from "@/components/worlds/wiki/WorldWiki";

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

    await userEvent.click(await screen.findByText("Accueil"));

    expect(mdProps).toHaveBeenCalledWith(
      expect.objectContaining({ allowImages: true }),
    );
  });

  it("active la barre de mise en forme flottante en mode édition de page", async () => {
    setup();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    // Bascule le panneau en mode modification (bouton d'en-tête)
    await user.click(screen.getByText("Modifier"));
    // Sélectionne la page dans l'arbre
    await user.click(await screen.findByText("Accueil"));
    // Entre en édition du contenu de la page
    await user.click(screen.getByText("Modifier"));

    expect(pbeProps).toHaveBeenCalledWith(
      expect.objectContaining({ formatting: true }),
    );
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

    await screen.findByText("Accueil");

    await user.type(screen.getByPlaceholderText("Rechercher dans le wiki…"), "forêt");
    await user.click(await screen.findByText("La Forêt Noire"));

    // La recherche se referme après sélection...
    expect(screen.getByPlaceholderText("Rechercher dans le wiki…")).toHaveValue("");
    // ...et le dossier ancêtre apparaît déplié dans l'arbre (et dans le fil d'Ariane du contenu sélectionné).
    expect(screen.getAllByText("Lieux").length).toBeGreaterThan(0);
  });

  it("affiche le fil d'Ariane du dossier parent au-dessus du contenu", async () => {
    setupWithFolder();
    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit={false} />);

    await screen.findByText("Accueil");
    await user.click(screen.getByText("Lieux")); // déplie le dossier
    await user.click(await screen.findByText("La Forêt Noire"));

    expect(screen.getByRole("button", { name: "Lieux" })).toBeInTheDocument();
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
      draft_updated_at: "2026-01-01T00:00:00.000Z",
      published_at: null,
    };
    const templateContent =
      "## Apparence\n\n## Personnalité\n\n## Histoire\n\n## Relations\n\n## Objectifs\n\n## Notes";
    const mock = createSupabaseMock({
      results: [
        { data: [], error: null },
        { data: insertedPage, error: null },
        { data: { draft_content: templateContent }, error: null },
      ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const user = userEvent.setup();
    render(<WorldWiki worldId="w1" canEdit />);

    await user.click(screen.getByText("Modifier"));
    await user.click(screen.getByText("Page"));

    await user.click(screen.getByTitle("Modèle"));
    await user.click(screen.getByRole("menuitem", { name: /Fiche personnage/ }));

    await user.type(screen.getByPlaceholderText("Titre de la page…"), "Aria{Enter}");

    expect(await screen.findByTestId("pbe")).toBeInTheDocument();
    expect(pbeProps).toHaveBeenCalledWith(expect.objectContaining({ value: templateContent }));
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

    await user.click(screen.getByText("Modifier"));
    await screen.findByText("Accueil");

    await user.click(screen.getByLabelText("Options"));
    await user.click(screen.getByText("Réserver aux éditeurs"));

    await waitFor(() => {
      const builders = mock.buildersFor("world_wiki_pages");
      expect(builders[1].update).toHaveBeenCalledWith({ is_restricted: true });
    });
  });
});
