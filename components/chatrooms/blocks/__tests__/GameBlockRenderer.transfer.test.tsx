import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ userId: "u1" }) }));
vi.mock("@/components/chatrooms/blocks/TransferBlock", () => ({
  TransferBlockView: ({ id, authorPersonaId }: { id: string; authorPersonaId: string | null | undefined }) => (
    <div data-testid="transfer" data-id={id} data-author={authorPersonaId ?? ""} />
  ),
}));

import { GameBlockRenderer } from "@/components/chatrooms/blocks/GameBlockRenderer";

describe("GameBlockRenderer — bloc de transfert", () => {
  // Les messages du fil ne portent pas `persona_id` : leur persona vient en
  // jointure (MESSAGE_COLUMNS, `persona:personas(id, …)`).
  it("passe le persona de l'auteur, tel que le fil le joint", () => {
    render(
      <GameBlockRenderer
        block={{ _type: "transfer", id: "t1" }}
        mine
        label=""
        message={{ id: 1, chat_id: "ch1", persona: { id: "p1" } }}
      />,
    );
    const view = screen.getByTestId("transfer");
    expect(view).toHaveAttribute("data-id", "t1");
    expect(view).toHaveAttribute("data-author", "p1");
  });

  it("ou sa colonne persona_id, quand le message la porte", () => {
    render(
      <GameBlockRenderer
        block={{ _type: "transfer", id: "t1" }}
        mine
        label=""
        message={{ id: 1, chat_id: "ch1", persona_id: "p2" }}
      />,
    );
    expect(screen.getByTestId("transfer")).toHaveAttribute("data-author", "p2");
  });
});
