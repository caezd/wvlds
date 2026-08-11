import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { MessageActionsDropdown } from "@/components/chatrooms/message/MessageActionsDropdown";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const CONTENT = "**Bonjour** le [monde](https://example.com) !";

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * navigator.clipboard n'existe pas tant qu'aucun composant n'a été rendu au
 * moins une fois dans ce jsdom (vérifié empiriquement : `typeof
 * navigator.clipboard` vaut "undefined" avant le premier `render()`, y
 * compris depuis un hook `beforeEach`) — le spy doit donc être posé après.
 */
function spyOnClipboard() {
  return vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
}

describe("MessageActionsDropdown — copier le message", () => {
  it("clique sur \"Copier le message\" copie le texte brut (markdown dépouillé)", async () => {
    const user = userEvent.setup();
    render(
      <MessageActionsDropdown mine={false} isPinned={false} content={CONTENT} onEdit={() => {}} />,
    );
    const writeText = spyOnClipboard();

    await user.click(screen.getByLabelText("Actions"));
    await user.click(await screen.findByText("Copier le message"));

    expect(writeText).toHaveBeenCalledWith("Bonjour le monde !");
    expect(toast.success).toHaveBeenCalledWith("Texte copié dans le presse-papiers.");
  });

  it("clique sur \"Copier le texte\" dans le sous-menu copie le texte brut", async () => {
    const user = userEvent.setup();
    render(
      <MessageActionsDropdown mine={false} isPinned={false} content={CONTENT} onEdit={() => {}} />,
    );
    const writeText = spyOnClipboard();

    await user.click(screen.getByLabelText("Actions"));
    // Radix (SubTrigger) n'ouvre le sous-menu qu'au pointermove avec
    // pointerType "mouse" (après un court délai interne) — ni hover ni
    // ArrowRight ne suffisent de façon fiable via userEvent en jsdom. Éviter
    // aussi de cliquer le SubTrigger : ça copie *et* ferme tout le menu.
    fireEvent.pointerMove(await screen.findByText("Copier le message"), { pointerType: "mouse" });
    await user.click(await screen.findByText("Copier le texte"));

    expect(writeText).toHaveBeenCalledWith("Bonjour le monde !");
    expect(toast.success).toHaveBeenCalledWith("Texte copié dans le presse-papiers.");
  });

  it("clique sur \"Copier le markdown\" copie le contenu brut tel quel", async () => {
    const user = userEvent.setup();
    render(
      <MessageActionsDropdown mine={false} isPinned={false} content={CONTENT} onEdit={() => {}} />,
    );
    const writeText = spyOnClipboard();

    await user.click(screen.getByLabelText("Actions"));
    fireEvent.pointerMove(await screen.findByText("Copier le message"), { pointerType: "mouse" });
    await user.click(await screen.findByText("Copier le markdown"));

    expect(writeText).toHaveBeenCalledWith(CONTENT);
    expect(toast.success).toHaveBeenCalledWith("Markdown copié dans le presse-papiers.");
  });

  it("affiche un toast d'erreur si l'écriture dans le presse-papiers échoue", async () => {
    const user = userEvent.setup();
    render(
      <MessageActionsDropdown mine={false} isPinned={false} content={CONTENT} onEdit={() => {}} />,
    );
    spyOnClipboard().mockRejectedValueOnce(new Error("denied"));

    await user.click(screen.getByLabelText("Actions"));
    await user.click(await screen.findByText("Copier le message"));

    expect(toast.error).toHaveBeenCalledWith("Impossible de copier dans le presse-papiers.");
  });
});
