import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PinsSheet } from "@/components/chatrooms/message/PinsSheet";
import type { ChatPin, ChatMessageWithPersona } from "@/types/db";

const pins: ChatPin[] = [
  { id: "pin1", chat_id: "c1", message_id: 1, label: null, pinned_by: "u1", created_at: "2026-01-01T00:00:00Z" },
  { id: "pin2", chat_id: "c1", message_id: null, label: "Ancre du chapitre 2", pinned_by: "u1", created_at: "2026-01-02T00:00:00Z" },
];

const messages: ChatMessageWithPersona[] = [
  { id: 1, chat_id: "c1", author_id: "u1", content: "Message épinglé", created_at: "2026-01-01T00:00:00Z" },
];

describe("PinsSheet", () => {
  it("affiche un état vide quand il n'y a aucune épingle", () => {
    render(
      <PinsSheet open pins={[]} messages={[]} onOpenChange={() => {}} onScrollToMessage={() => {}} />,
    );
    expect(screen.getByText("Aucun message épinglé.")).toBeInTheDocument();
  });

  it("liste les épingles (messages et ancres)", () => {
    render(
      <PinsSheet open pins={pins} messages={messages} onOpenChange={() => {}} onScrollToMessage={() => {}} />,
    );
    expect(screen.getByText("Message épinglé")).toBeInTheDocument();
    expect(screen.getByText("Ancre du chapitre 2")).toBeInTheDocument();
  });

  it("scrolle vers le message et referme la sheet au clic sur une carte", async () => {
    const onScrollToMessage = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <PinsSheet
        open
        pins={pins}
        messages={messages}
        onOpenChange={onOpenChange}
        onScrollToMessage={onScrollToMessage}
      />,
    );

    await userEvent.click(screen.getByText("Message épinglé"));

    expect(onScrollToMessage).toHaveBeenCalledWith(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
