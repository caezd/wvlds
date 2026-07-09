import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const useCurrentUser = vi.fn();
vi.mock("@/components/providers/CurrentUserProvider", () => ({
  useCurrentUser: () => useCurrentUser(),
}));

vi.mock("@/components/MarkdownRenderer", () => ({
  MarkdownContent: ({ content }: { content: string }) => <span>{content}</span>,
  proseClassName: (_size: string, className?: string) =>
    ["prose", className].filter(Boolean).join(" "),
}));

import { ChatroomMessageBubble } from "../ChatroomMessageBubble";

const BASE_PREFS = { messageFont: "sans", messageTextSize: "base", messageTextAlign: "left" };

describe("ChatroomMessageBubble — police du texte", () => {
  it("n'ajoute pas de classe de police quand la préférence est 'sans'", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS });

    const { container } = render(
      <ChatroomMessageBubble message={{ content: "Bonjour !" }} isMine={false} />,
    );

    expect(container.querySelector(".font-message-serif")).toBeNull();
    expect(container.querySelector(".font-message-dyslexic")).toBeNull();
  });

  it("ajoute la classe serif quand la préférence est 'serif'", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS, messageFont: "serif" });

    const { container } = render(
      <ChatroomMessageBubble message={{ content: "Bonjour !" }} isMine={false} />,
    );

    expect(container.querySelector(".font-message-serif")).not.toBeNull();
  });

  it("ajoute la classe dyslexie quand la préférence est 'dyslexic'", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS, messageFont: "dyslexic" });

    const { container } = render(
      <ChatroomMessageBubble message={{ content: "Bonjour !" }} isMine={false} />,
    );

    expect(container.querySelector(".font-message-dyslexic")).not.toBeNull();
  });

  it("applique aussi la police choisie au mode « dialogues en bulles »", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS, messageFont: "dyslexic" });

    const { container } = render(
      <ChatroomMessageBubble
        message={{ content: '"Bonjour !"', metadata: { bubbles: true } }}
        isMine={false}
      />,
    );

    expect(container.querySelector(".font-message-dyslexic")).not.toBeNull();
  });
});

describe("ChatroomMessageBubble — taille du texte", () => {
  it("n'ajoute pas de classe de taille quand la préférence est 'base'", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS });

    const { container } = render(
      <ChatroomMessageBubble message={{ content: "Bonjour !" }} isMine={false} />,
    );

    expect(container.querySelector(".message-text-sm")).toBeNull();
    expect(container.querySelector(".message-text-lg")).toBeNull();
  });

  it("ajoute la classe message-text-sm quand la préférence est 'sm'", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS, messageTextSize: "sm" });

    const { container } = render(
      <ChatroomMessageBubble message={{ content: "Bonjour !" }} isMine={false} />,
    );

    expect(container.querySelector(".message-text-sm")).not.toBeNull();
  });

  it("ajoute la classe message-text-lg quand la préférence est 'lg', y compris en mode bulles", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS, messageTextSize: "lg" });

    const { container } = render(
      <ChatroomMessageBubble
        message={{ content: '"Bonjour !"', metadata: { bubbles: true } }}
        isMine={false}
      />,
    );

    expect(container.querySelectorAll(".message-text-lg").length).toBeGreaterThan(0);
  });
});

describe("ChatroomMessageBubble — alignement du texte", () => {
  it("n'ajoute pas de classe d'alignement quand la préférence est 'left'", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS });

    const { container } = render(
      <ChatroomMessageBubble message={{ content: "Bonjour !" }} isMine={false} />,
    );

    expect(container.querySelector(".text-justify")).toBeNull();
  });

  it("ajoute la classe text-justify quand la préférence est 'justify', y compris en mode bulles", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS, messageTextAlign: "justify" });

    const { container } = render(
      <ChatroomMessageBubble
        message={{ content: '"Bonjour !"', metadata: { bubbles: true } }}
        isMine={false}
      />,
    );

    expect(container.querySelectorAll(".text-justify").length).toBeGreaterThan(0);
  });
});
