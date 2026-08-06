import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/components/MarkdownRenderer", () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

// Le vrai DeleteConfirmDialog (Radix AlertDialog) imbriqué dans le Sheet
// (aussi un Radix Dialog) déclenche une boucle infinie de focus-trap sous
// jsdom (deux FocusScope actifs simultanément) — RangeError: Maximum call
// stack size exceeded, qui plante le worker de test. Comportement propre en
// navigateur réel (Radix gère la pile de dialogs imbriqués), donc stub
// minimal ici plutôt qu'un vrai bug applicatif à corriger : confirme
// automatiquement dès l'ouverture (pas de second clic sur un bouton réel),
// ce qui suffit à couvrir le déclenchement de `restore()` par le flux de
// confirmation, sans revalider l'UI d'AlertDialog elle-même (déjà générique).
vi.mock("@/components/ui/delete-confirm-dialog", () => ({
  DeleteConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) => {
    useEffect(() => {
      if (open) onConfirm();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    return null;
  },
}));

import { WikiVersionHistoryPanel } from "@/components/worlds/wiki/WikiVersionHistoryPanel";

const VERSIONS = [
  {
    id: "v2",
    title: "Accueil",
    content: "Contenu le plus récent",
    created_at: "2026-02-01T10:00:00.000Z",
    author: { username: "caedrik" },
  },
  {
    id: "v1",
    title: "Accueil",
    content: "Contenu plus ancien",
    created_at: "2026-01-01T10:00:00.000Z",
    author: null,
  },
];

describe("WikiVersionHistoryPanel", () => {
  it("charge et liste les versions à l'ouverture", async () => {
    const mock = createSupabaseMock({ results: [{ data: VERSIONS, error: null }] });
    render(
      <WikiVersionHistoryPanel
        open
        onOpenChange={vi.fn()}
        pageId="p1"
        supabase={mock.client as never}
        onRestored={vi.fn()}
      />,
    );

    expect(await screen.findByText("caedrik")).toBeInTheDocument();
    expect(screen.getByText("Auteur inconnu")).toBeInTheDocument();
  });

  it("affiche un message quand aucune version n'existe", async () => {
    const mock = createSupabaseMock({ results: [{ data: [], error: null }] });
    render(
      <WikiVersionHistoryPanel
        open
        onOpenChange={vi.fn()}
        pageId="p1"
        supabase={mock.client as never}
        onRestored={vi.fn()}
      />,
    );

    expect(await screen.findByText("Aucune version enregistrée pour le moment.")).toBeInTheDocument();
  });

  it("affiche l'aperçu d'une version au clic", async () => {
    const mock = createSupabaseMock({ results: [{ data: VERSIONS, error: null }] });
    const user = userEvent.setup();
    render(
      <WikiVersionHistoryPanel
        open
        onOpenChange={vi.fn()}
        pageId="p1"
        supabase={mock.client as never}
        onRestored={vi.fn()}
      />,
    );

    await user.click(await screen.findByText("caedrik"));
    expect(await screen.findByText("Contenu le plus récent")).toBeInTheDocument();
  });

  it("restaure une version après confirmation et notifie le parent", async () => {
    const mock = createSupabaseMock({
      results: [
        { data: VERSIONS, error: null },
        { data: null, error: null }, // update de restauration
      ],
    });
    const onRestored = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WikiVersionHistoryPanel
        open
        onOpenChange={onOpenChange}
        pageId="p1"
        supabase={mock.client as never}
        onRestored={onRestored}
      />,
    );

    await screen.findByText("caedrik");
    const restoreButtons = screen.getAllByRole("button", { name: "Restaurer" });
    await user.click(restoreButtons[0]); // version la plus récente (v2) — la confirmation (mockée) se déclenche automatiquement

    await waitFor(() => {
      expect(onRestored).toHaveBeenCalledWith(
        expect.objectContaining({ content: "Contenu le plus récent" }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
