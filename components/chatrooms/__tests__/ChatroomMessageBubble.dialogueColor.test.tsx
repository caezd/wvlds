import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

const useCurrentUser = vi.fn();
vi.mock("@/components/providers/CurrentUserProvider", () => ({
  useCurrentUser: () => useCurrentUser(),
}));

vi.mock("@/components/MarkdownRenderer", () => ({
  MarkdownContent: ({ content }: { content: string }) => <span>{content}</span>,
  proseClassName: (_size: string, className?: string) =>
    ["prose", className].filter(Boolean).join(" "),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ChatroomMessageBubble } from "../message/ChatroomMessageBubble";

const BASE_PREFS = { messageFont: "sans", messageTextSize: "base", messageTextAlign: "left" };

/** navigator.clipboard n'existe pas tant qu'aucun composant n'a été rendu au
 *  moins une fois dans ce jsdom — le spy doit donc être posé après le
 *  premier render. */
function spyOnClipboard() {
  return vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
}

beforeEach(() => {
  useCurrentUser.mockReturnValue({ ...BASE_PREFS });
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("ChatroomMessageBubble — copie de la couleur de dialogue (clic droit)", () => {
  it("propose « Copier la couleur de dialogue » sur une bulle colorée, et copie au clic", async () => {
    const user = userEvent.setup();
    render(
      <ChatroomMessageBubble
        message={{ content: '"Bonjour !"', metadata: { bubbles: true, bubbleColor: "#ff00aa" } }}
        isMine={false}
      />,
    );
    const writeText = spyOnClipboard();

    const bubble = screen.getByText("Bonjour !");
    fireEvent.contextMenu(bubble);

    await user.click(await screen.findByText("Copier la couleur de dialogue"));

    expect(writeText).toHaveBeenCalledWith("#ff00aa");
    expect(toast.success).toHaveBeenCalledWith("Couleur copiée dans le presse-papiers.");
  });

  it("ne propose rien au clic droit quand la bulle n'a pas de couleur", () => {
    render(
      <ChatroomMessageBubble
        message={{ content: '"Bonjour !"', metadata: { bubbles: true } }}
        isMine={false}
      />,
    );

    const bubble = screen.getByText("Bonjour !");
    fireEvent.contextMenu(bubble);

    expect(screen.queryByText("Copier la couleur de dialogue")).not.toBeInTheDocument();
  });

  it("désactive le menu contextuel sur mobile (le long-press du message gère déjà l'action)", () => {
    render(
      <ChatroomMessageBubble
        message={{ content: '"Bonjour !"', metadata: { bubbles: true, bubbleColor: "#ff00aa" } }}
        isMine={false}
        isMobile
      />,
    );

    const bubble = screen.getByText("Bonjour !");
    fireEvent.contextMenu(bubble);

    expect(screen.queryByText("Copier la couleur de dialogue")).not.toBeInTheDocument();
  });
});
