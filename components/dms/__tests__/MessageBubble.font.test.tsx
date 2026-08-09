import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const useCurrentUser = vi.fn();
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => useCurrentUser(),
}));

import { MessageBubble } from "../index";

const BASE_PREFS = { messageFont: "sans", messageTextSize: "base", messageTextAlign: "left" };

describe("MessageBubble (DM) — préférences de texte", () => {
  it("n'ajoute aucune classe de préférence avec les réglages par défaut", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS });

    const { container } = render(
      <MessageBubble id={1} content="Bonjour !" isMine={false} createdAt="2026-08-01T10:00:00.000Z" />,
    );

    expect(container.querySelector(".font-message-serif")).toBeNull();
    expect(container.querySelector(".font-message-dyslexic")).toBeNull();
    expect(container.querySelector(".message-text-sm")).toBeNull();
    expect(container.querySelector(".message-text-lg")).toBeNull();
    expect(container.querySelector(".text-justify")).toBeNull();
  });

  it("applique la police choisie", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS, messageFont: "dyslexic" });

    const { container } = render(
      <MessageBubble id={1} content="Bonjour !" isMine={false} createdAt="2026-08-01T10:00:00.000Z" />,
    );

    expect(container.querySelector(".font-message-dyslexic")).not.toBeNull();
  });

  it("applique la taille de texte choisie", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS, messageTextSize: "lg" });

    const { container } = render(
      <MessageBubble id={1} content="Bonjour !" isMine={true} createdAt="2026-08-01T10:00:00.000Z" />,
    );

    expect(container.querySelector(".message-text-lg")).not.toBeNull();
  });

  it("applique l'alignement justifié choisi", () => {
    useCurrentUser.mockReturnValue({ ...BASE_PREFS, messageTextAlign: "justify" });

    const { container } = render(
      <MessageBubble id={1} content="Bonjour !" isMine={false} createdAt="2026-08-01T10:00:00.000Z" />,
    );

    expect(container.querySelector(".text-justify")).not.toBeNull();
  });
});
