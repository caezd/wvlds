import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchInput } from "@/components/chatrooms/search/SearchInput";
import type { SearchAuthorOption, SearchChatroomOption } from "@/lib/chatSearchDirectory";
import type { SearchToken } from "@/components/chatrooms/search/types";

// jsdom fournit un localStorage partiel (pas de .clear()) — remplacé par une
// implémentation complète basée sur un objet JS (même pattern que
// components/__tests__/ChatroomComposerDraft.test.tsx).
const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

beforeEach(() => {
  localStorage.clear();
});

const authors: SearchAuthorOption[] = [
  { kind: "profile", id: "u-kael", label: "kaotika", avatarUrl: null },
  { kind: "persona", id: "p-kael", label: "kael", sublabel: "kaotika", avatarUrl: null },
];

const chatrooms: SearchChatroomOption[] = [
  { id: "c-general", label: "général" },
  { id: "c-photos", label: "photos" },
];

function setup(tokens: SearchToken[] = []) {
  const onAddToken = vi.fn();
  const onRemoveToken = vi.fn();
  const onSubmit = vi.fn();
  const onOpenAdvancedFilters = vi.fn();
  render(
    <SearchInput
      worldId="w1"
      authors={authors}
      chatrooms={chatrooms}
      tokens={tokens}
      onAddToken={onAddToken}
      onRemoveToken={onRemoveToken}
      freeText=""
      onSubmit={onSubmit}
      onOpenAdvancedFilters={onOpenAdvancedFilters}
    />,
  );
  return { onAddToken, onRemoveToken, onSubmit, onOpenAdvancedFilters };
}

describe("SearchInput", () => {
  it("affiche le placeholder par défaut", () => {
    setup();
    expect(screen.getByPlaceholderText("Rechercher…")).toBeInTheDocument();
  });

  it("propose les auteurs correspondants après \"de:\" et ajoute un token à la sélection", async () => {
    const { onAddToken } = setup();
    const input = screen.getByPlaceholderText("Rechercher…");
    await userEvent.type(input, "de:kael");

    const option = await screen.findByText("kael");
    await userEvent.click(option);

    expect(onAddToken).toHaveBeenCalledWith(
      expect.objectContaining({ type: "author", kind: "persona", value: "p-kael", label: "kael" }),
    );
    expect(input).toHaveValue("");
  });

  it("propose les salons après \"dans:\"", async () => {
    setup();
    const input = screen.getByPlaceholderText("Rechercher…");
    await userEvent.type(input, "dans:gén");

    expect(await screen.findByText("# général")).toBeInTheDocument();
    expect(screen.queryByText("# photos")).not.toBeInTheDocument();
  });

  it("déclenche onSubmit avec le texte libre sur Entrée hors token actif", async () => {
    const { onSubmit } = setup();
    const input = screen.getByPlaceholderText("Rechercher…");
    await userEvent.type(input, "bonjour tout le monde{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("bonjour tout le monde");
  });

  it("affiche les raccourcis de filtres au clic sur le champ vide", async () => {
    setup();
    const input = screen.getByPlaceholderText("Rechercher…");
    await userEvent.click(input);

    expect(await screen.findByText("D'un utilisateur spécifique")).toBeInTheDocument();
    expect(screen.getByText("Envoyé dans un salon spécifique")).toBeInTheDocument();
    expect(screen.getByText("Comprend un type de données spécifique")).toBeInTheDocument();
    expect(screen.getByText("Mentionne un utilisateur spécifique")).toBeInTheDocument();
    expect(screen.getByText("Plus de filtres")).toBeInTheDocument();
  });

  it("un raccourci insère son préfixe et bascule directement sur ses suggestions", async () => {
    setup();
    const input = screen.getByPlaceholderText("Rechercher…");
    await userEvent.click(input);
    await userEvent.click(await screen.findByText("Envoyé dans un salon spécifique"));

    expect(input).toHaveValue("dans:");
    expect(await screen.findByText("# général")).toBeInTheDocument();
  });

  it("le raccourci « Plus de filtres » ouvre le panneau de filtres avancés", async () => {
    const { onOpenAdvancedFilters } = setup();
    const input = screen.getByPlaceholderText("Rechercher…");
    await userEvent.click(input);
    await userEvent.click(await screen.findByText("Plus de filtres"));

    expect(onOpenAdvancedFilters).toHaveBeenCalledTimes(1);
  });

  it("enregistre une recherche texte dans l'historique et la réaffiche à la prochaine ouverture", async () => {
    const { onSubmit } = setup();
    const input = screen.getByPlaceholderText("Rechercher…");
    await userEvent.type(input, "jpp{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("jpp");

    // Nouveau montage (comme une réouverture du centre de recherche) : le
    // terme précédemment recherché doit apparaître dans l'historique.
    setup();
    const input2 = screen.getAllByPlaceholderText("Rechercher…").at(-1)!;
    await userEvent.click(input2);
    expect(await screen.findByText("jpp")).toBeInTheDocument();
  });

  it("relance la recherche au clic sur une entrée d'historique", async () => {
    setup();
    const input = screen.getByPlaceholderText("Rechercher…");
    await userEvent.type(input, "jpp{Enter}");

    const { onSubmit: onSubmit2 } = setup();
    const input2 = screen.getAllByPlaceholderText("Rechercher…").at(-1)!;
    await userEvent.click(input2);
    await userEvent.click(await screen.findByText("jpp"));

    expect(input2).toHaveValue("jpp");
    expect(onSubmit2).toHaveBeenCalledWith("jpp");
  });

  it("efface l'historique de recherche", async () => {
    setup();
    const input = screen.getByPlaceholderText("Rechercher…");
    await userEvent.type(input, "jpp{Enter}");

    setup();
    const input2 = screen.getAllByPlaceholderText("Rechercher…").at(-1)!;
    await userEvent.click(input2);
    await screen.findByText("jpp");
    await userEvent.click(screen.getByLabelText("Effacer l'historique de recherche"));

    expect(screen.queryByText("jpp")).not.toBeInTheDocument();
  });

  it("retire un token existant au clic sur sa croix", async () => {
    const token: SearchToken = { id: "channel:c-general", type: "channel", label: "général", value: "c-general" };
    const { onRemoveToken } = setup([token]);

    await userEvent.click(screen.getByLabelText("Retirer le filtre général"));

    expect(onRemoveToken).toHaveBeenCalledWith("channel:c-general");
  });
});
