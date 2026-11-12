import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));

import { MessageReplyQuote } from "../MessageReplyQuote";

describe("MessageReplyQuote", () => {
  it("affiche l'auteur et l'extrait, et remonte au message cité au clic", () => {
    const onJump = vi.fn();
    render(
      <MessageReplyQuote
        replyToId={7}
        replyTo={{ id: 7, content: "Il pleut sur la ville", author_id: "u", persona: { name: "Aria" } }}
        onJump={onJump}
      />,
    );
    expect(screen.getByText("Aria")).toBeInTheDocument();
    expect(screen.getByText("Il pleut sur la ville")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("reply-quote"));
    expect(onJump).toHaveBeenCalledWith(7);
  });

  it("signale un message cité supprimé ou illisible sans rien en révéler", () => {
    render(<MessageReplyQuote replyToId={7} replyTo={null} />);
    expect(screen.getByTestId("reply-quote")).toHaveTextContent("replyUnavailable");
  });

  it("libellé générique pour un bloc de jeu", () => {
    render(<MessageReplyQuote replyToId={7} replyTo={{ id: 7, content: '{"_type":"dice"}', author_id: "u" }} />);
    expect(screen.getByText("replyBlock")).toBeInTheDocument();
  });
});
