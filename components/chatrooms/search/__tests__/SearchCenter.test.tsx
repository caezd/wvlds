import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
});

describe("SearchCenter", () => {
  it("affiche l'indice tant qu'aucune recherche n'a été lancée", () => {
    render(<SearchCenter worldId="w1" open onOpenChange={() => {}} />);
    expect(screen.getByText(/Tapez de: dans: contient:/)).toBeInTheDocument();
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
