import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Cf. WikiVersionHistoryPanel.test.tsx : le vrai DeleteConfirmDialog (Radix
// AlertDialog) imbriqué dans le Sheet déclenche une boucle infinie de
// focus-trap sous jsdom — stub minimal qui confirme dès l'ouverture.
vi.mock("@/components/ui/delete-confirm-dialog", () => ({
  DeleteConfirmDialog: ({ trigger, onConfirm }: { trigger: React.ReactNode; onConfirm: () => void }) => {
    return (
      <span
        onClick={onConfirm}
        onKeyDown={e => { if (e.key === "Enter") onConfirm(); }}
      >
        {trigger}
      </span>
    );
  },
}));

import { toast } from "sonner";
import { WorldLexiconManager } from "@/components/worlds/wiki/WorldLexiconManager";

const TERMS = [
  { id: "t1", world_id: "w1", term: "Dragon", description: "Une créature ancienne." },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorldLexiconManager", () => {
  it("affiche la liste des termes existants", () => {
    const mock = createSupabaseMock();
    render(
      <WorldLexiconManager open onOpenChange={vi.fn()} worldId="w1" supabase={mock.client as never} terms={TERMS} />,
    );

    expect(screen.getByText("Dragon")).toBeInTheDocument();
    expect(screen.getByText("Une créature ancienne.")).toBeInTheDocument();
  });

  it("affiche un message quand le lexique est vide", () => {
    const mock = createSupabaseMock();
    render(
      <WorldLexiconManager open onOpenChange={vi.fn()} worldId="w1" supabase={mock.client as never} terms={[]} />,
    );

    expect(screen.getByText("Aucun terme pour l'instant.")).toBeInTheDocument();
  });

  it("ajoute un nouveau terme", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    const user = userEvent.setup();
    render(
      <WorldLexiconManager open onOpenChange={vi.fn()} worldId="w1" supabase={mock.client as never} terms={[]} />,
    );

    await user.click(screen.getByText("Ajouter un terme"));
    await user.type(screen.getByPlaceholderText("Terme…"), "Elfe");
    await user.type(screen.getByPlaceholderText("Description…"), "Un peuple ancien.");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => {
      const builder = mock.buildersFor("world_lexicon_terms")[0];
      expect(builder.insert).toHaveBeenCalledWith({
        world_id: "w1",
        term: "Elfe",
        description: "Un peuple ancien.",
      });
    });
  });

  it("modifie un terme existant", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    const user = userEvent.setup();
    render(
      <WorldLexiconManager open onOpenChange={vi.fn()} worldId="w1" supabase={mock.client as never} terms={TERMS} />,
    );

    const row = screen.getByText("Dragon").closest(".group")!;
    await user.click(row.querySelectorAll("button")[0]); // Pencil

    const input = screen.getByDisplayValue("Dragon");
    await user.clear(input);
    await user.type(input, "Dragon ancestral");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      const builder = mock.buildersFor("world_lexicon_terms")[0];
      expect(builder.update).toHaveBeenCalledWith({
        term: "Dragon ancestral",
        description: "Une créature ancienne.",
      });
      expect(builder.eq).toHaveBeenCalledWith("id", "t1");
    });
  });

  it("supprime un terme après confirmation", async () => {
    const mock = createSupabaseMock({ results: [{ data: null, error: null }] });
    const user = userEvent.setup();
    render(
      <WorldLexiconManager open onOpenChange={vi.fn()} worldId="w1" supabase={mock.client as never} terms={TERMS} />,
    );

    const row = screen.getByText("Dragon").closest(".group")!;
    await user.click(row.querySelectorAll("button")[1]); // Trash2 (confirme immédiatement via le stub)

    await waitFor(() => {
      const builder = mock.buildersFor("world_lexicon_terms")[0];
      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith("id", "t1");
    });
  });

  it("affiche un message convivial en cas de terme en doublon", async () => {
    const mock = createSupabaseMock({
      results: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
    });
    const user = userEvent.setup();
    render(
      <WorldLexiconManager open onOpenChange={vi.fn()} worldId="w1" supabase={mock.client as never} terms={[]} />,
    );

    await user.click(screen.getByText("Ajouter un terme"));
    await user.type(screen.getByPlaceholderText("Terme…"), "Dragon");
    await user.type(screen.getByPlaceholderText("Description…"), "Doublon");
    await user.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Ce terme existe déjà dans le lexique.");
    });
  });
});
