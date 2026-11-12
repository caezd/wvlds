import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/worldMembers", () => ({
  fetchWorldMembers: vi.fn(async () => [
    { user_id: "a", username: "Alice" },
    { user_id: "b", username: "Bob" },
  ]),
}));
const saveTurn = vi.fn();
const removeTurn = vi.fn();
vi.mock("@/lib/chatroomTurns", async (orig) => ({
  ...(await orig<typeof import("@/lib/chatroomTurns")>()),
  saveTurn: (...a: unknown[]) => saveTurn(...a),
  removeTurn: (...a: unknown[]) => removeTurn(...a),
}));

import { ChatroomTurnDialog } from "../ChatroomTurnDialog";

beforeEach(() => {
  saveTurn.mockReset();
  removeTurn.mockReset();
});

describe("ChatroomTurnDialog", () => {
  it("compose l'ordre à partir des membres et l'enregistre", async () => {
    const saved = { chat_id: "c1", enabled: true, order_user_ids: ["b", "a"], current_index: 0 };
    saveTurn.mockResolvedValue({ turn: saved });
    const onSaved = vi.fn();
    render(<ChatroomTurnDialog open onOpenChange={vi.fn()} chatId="c1" worldId="w1" ownerId={null} turn={null} onSaved={onSaved} />);

    fireEvent.click(await screen.findByText("Bob"));
    fireEvent.click(screen.getByText("Alice"));
    fireEvent.click(screen.getByText("turnSave"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(saveTurn).toHaveBeenCalledWith(expect.anything(), "c1", { enabled: true, order_user_ids: ["b", "a"], current_index: 0 });
  });

  it("garde le tour du joueur courant quand on réordonne", async () => {
    saveTurn.mockResolvedValue({ turn: { chat_id: "c1", enabled: true, order_user_ids: ["b", "a"], current_index: 0 } });
    const turn = { chat_id: "c1", enabled: true, order_user_ids: ["a", "b"], current_index: 1 }; // tour de b
    render(<ChatroomTurnDialog open onOpenChange={vi.fn()} chatId="c1" worldId="w1" ownerId={null} turn={turn} onSaved={vi.fn()} />);

    await screen.findAllByText("Bob");
    fireEvent.click(screen.getAllByLabelText("turnMoveUp")[1]); // b passe devant
    fireEvent.click(screen.getByText("turnSave"));

    await waitFor(() => expect(saveTurn).toHaveBeenCalled());
    expect(saveTurn.mock.calls[0][2]).toMatchObject({ order_user_ids: ["b", "a"], current_index: 0 });
  });

  it("retire l'ordre", async () => {
    const off = { chat_id: "c1", enabled: false, order_user_ids: [], current_index: 0 };
    removeTurn.mockResolvedValue({ turn: off });
    const onSaved = vi.fn();
    const turn = { chat_id: "c1", enabled: true, order_user_ids: ["a"], current_index: 0 };
    render(<ChatroomTurnDialog open onOpenChange={vi.fn()} chatId="c1" worldId="w1" ownerId={null} turn={turn} onSaved={onSaved} />);
    fireEvent.click(await screen.findByText("turnRemove"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(off));
  });
});
