import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchCenter } from "@/components/chatrooms/search/SearchCenter";
import type { SearchAuthorOption, SearchChatroomOption } from "@/lib/chatSearchDirectory";
import type { SearchPage } from "@/lib/chatSearch";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn(() => ({})) }));

const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

// SearchFiltersDrawer est un second Drawer indépendant : le monter ouvert en
// même temps que celui de SearchCenter reproduit le bug de focus infini de
// jsdom déjà rencontré avec des Dialog imbriqués (cf. mémoire projet) — on le
// stub, ce fichier ne teste pas ce panneau.
vi.mock("@/components/chatrooms/search/SearchFiltersDrawer", () => ({
  SearchFiltersDrawer: () => null,
}));

const authorsFixture: SearchAuthorOption[] = [
  { kind: "profile", id: "u1", label: "kaotika", avatarUrl: null },
  { kind: "persona", id: "p1", label: "kael", sublabel: "kaotika", avatarUrl: null },
];
const chatroomsFixture: SearchChatroomOption[] = [
  { id: "c1", label: "général" },
  { id: "c2", label: "photos" },
];

vi.mock("@/lib/chatSearchDirectory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chatSearchDirectory")>();
  return {
    ...actual,
    listWorldAuthorsForSearch: vi.fn(async () => authorsFixture),
    listWorldChatroomsForSearch: vi.fn(async () => chatroomsFixture),
  };
});

const searchMock = vi.hoisted(() => vi.fn());
// Le wiki se lit par un client que ces tests ne montent pas : un index vide
// suffit, la recherche des messages est le sujet.
const wikiLoadMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/wikiSearch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wikiSearch")>()),
  loadWorldWikiForSearch: wikiLoadMock,
}));

vi.mock("@/lib/chatSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chatSearch")>();
  return { ...actual, searchChatMessages: searchMock };
});

function resultPage(overrides: Partial<SearchPage> = {}): SearchPage {
  return {
    results: [
      {
        id: 1,
        chatId: "c1",
        authorId: "u1",
        personaId: "p1",
        content: "un message qui contient le mot recherché",
        createdAt: "2026-01-01T00:00:00Z",
        metadata: null,
        pinned: false,
      },
    ],
    nextCursor: null,
    hasMore: false,
    scannedThisCall: 1,
    ...overrides,
  };
}

function findResultParagraph() {
  return screen.findByText(
    (_, element) => element?.tagName.toLowerCase() === "p" && element.textContent === "un message qui contient le mot recherché",
  );
}

beforeEach(() => {
  pushMock.mockReset();
  searchMock.mockReset();
  searchMock.mockResolvedValue(resultPage());
  wikiLoadMock.mockReset();
  wikiLoadMock.mockResolvedValue({ index: { pages: [], notes: [] }, pagesById: new Map() });
});

describe("SearchCenter", () => {
  it("n'affiche aucun résultat tant qu'aucune recherche n'a été lancée", () => {
    render(<SearchCenter worldId="w1" open onOpenChange={() => {}} />);
    expect(screen.getByPlaceholderText("Rechercher…")).toBeInTheDocument();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("ne lance aucune recherche pour du texte libre seul, sans filtre", async () => {
    render(<SearchCenter worldId="w1" open onOpenChange={() => {}} />);

    const input = await screen.findByPlaceholderText("Rechercher…");
    await userEvent.type(input, "recherché{Enter}");

    expect(await screen.findByText(/Ajoutez au moins un filtre/)).toBeInTheDocument();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("lance une recherche texte libre une fois un filtre sélectionné et affiche les résultats", async () => {
    render(<SearchCenter worldId="w1" open onOpenChange={() => {}} />);

    const input = await screen.findByPlaceholderText("Rechercher…");
    await userEvent.type(input, "dans:gén");
    await userEvent.click(await screen.findByText("# général"));
    await userEvent.type(input, "recherché{Enter}");

    // Le terme recherché est mis en évidence dans un <mark> : le texte du
    // message est donc réparti sur plusieurs nœuds — on vérifie le contenu
    // textuel complet du paragraphe plutôt qu'un seul nœud de texte.
    expect(await findResultParagraph()).toBeInTheDocument();
    expect(searchMock).toHaveBeenCalledWith(
      expect.anything(),
      "w1",
      expect.objectContaining({ freeText: "recherché", chatIds: ["c1"] }),
      null,
    );
    // L'auteur est résolu via la persona (personaId prioritaire sur authorId).
    expect(screen.getByText("kael")).toBeInTheDocument();
  });

  it("montre les pages du wiki qui répondent, avant les messages", async () => {
    // Le centre ne fouillait que les messages : depuis un salon, le wiki était
    // invisible.
    const { buildSearchIndex } = await vi.importActual<typeof import("@/lib/wikiSearch")>("@/lib/wikiSearch");
    wikiLoadMock.mockResolvedValue({
      index: buildSearchIndex(
        [{ id: "p1", title: "Arkham", content: "Le mot recherché s'y trouve.", is_folder: false }],
        [],
      ),
      pagesById: new Map([["p1", { title: "Arkham", slug: "arkham" }]]),
    });
    render(<SearchCenter worldId="w1" open onOpenChange={() => {}} />);

    const input = await screen.findByPlaceholderText("Rechercher…");
    await userEvent.type(input, "dans:gén");
    await userEvent.click(await screen.findByText("# général"));
    await userEvent.type(input, "recherché{Enter}");

    await screen.findByText("Dans le wiki");
    await userEvent.click(screen.getByRole("button", { name: /Arkham/ }));

    expect(pushMock).toHaveBeenCalledWith("/w/w1?view=wiki&page=arkham");
  });

  it("ignore la réponse d'une recherche devenue obsolète", async () => {
    let resolveFirst!: (page: SearchPage) => void;
    const firstPromise = new Promise<SearchPage>((resolve) => {
      resolveFirst = resolve;
    });
    searchMock
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(
        resultPage({
          results: [
            {
              id: 2,
              chatId: "c2",
              authorId: "u1",
              personaId: null,
              content: "second résultat plus récent",
              createdAt: "2026-01-02T00:00:00Z",
              metadata: null,
              pinned: false,
            },
          ],
        }),
      );

    render(<SearchCenter worldId="w1" open onOpenChange={() => {}} />);
    const input = await screen.findByPlaceholderText("Rechercher…");

    // Sélectionne "général" -> recherche A, qui reste en attente (lente).
    await userEvent.type(input, "dans:gén");
    await userEvent.click(await screen.findByText("# général"));
    // Sélectionne aussi "photos" -> recherche B, qui se résout tout de suite.
    await userEvent.type(input, "dans:pho");
    await userEvent.click(await screen.findByText("# photos"));

    expect(await screen.findByText("second résultat plus récent")).toBeInTheDocument();

    // La recherche A (obsolète) se résout enfin : ne doit pas écraser B.
    await act(async () => {
      resolveFirst(resultPage({ results: [{ ...resultPage().results[0], id: 1, content: "premier résultat périmé" }] }));
      await Promise.resolve();
    });

    expect(screen.queryByText("premier résultat périmé")).not.toBeInTheDocument();
    expect(screen.getByText("second résultat plus récent")).toBeInTheDocument();
  });

  it("pré-remplit un token de salon retirable quand ouvert depuis une chatroom", async () => {
    render(<SearchCenter worldId="w1" initialChatId="c1" open onOpenChange={() => {}} />);

    expect(await screen.findByText("dans: général")).toBeInTheDocument();
  });

  it("navigue vers le message sélectionné et referme le centre de recherche", async () => {
    const onOpenChange = vi.fn();
    render(<SearchCenter worldId="w1" initialChatId="c1" open onOpenChange={onOpenChange} />);

    // Le token "dans: général" pré-rempli compte comme filtre actif (le
    // champ n'a alors plus de placeholder, cf. SearchInput).
    await screen.findByText("dans: général");
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "recherché{Enter}");
    const result = await findResultParagraph();
    await userEvent.click(result);

    expect(pushMock).toHaveBeenCalledWith("/c/c1?m=1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("SearchCenter — les lieux de la carte", () => {
  it("montre les lieux qui répondent, et ouvre la carte dessus", async () => {
    const { buildSearchIndex } = await vi.importActual<typeof import("@/lib/wikiSearch")>("@/lib/wikiSearch");
    wikiLoadMock.mockResolvedValue({
      index: buildSearchIndex([], [], [
        { id: "pin1", map_id: "m1", title: "Le port recherché", description: null },
      ]),
      pagesById: new Map(),
    });
    render(<SearchCenter worldId="w1" open onOpenChange={() => {}} />);

    const input = await screen.findByPlaceholderText("Rechercher…");
    await userEvent.type(input, "dans:gén");
    await userEvent.click(await screen.findByText("# général"));
    await userEvent.type(input, "recherché{Enter}");

    await screen.findByText("Sur la carte");
    await userEvent.click(screen.getByRole("button", { name: /Le port recherché/ }));

    // La carte ET l'épingle : l'adresse sait ouvrir un lieu précis.
    expect(pushMock).toHaveBeenCalledWith("/w/w1?view=map&map=m1&pin=pin1");
  });
});
