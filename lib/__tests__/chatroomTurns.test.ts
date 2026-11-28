import { describe, it, expect } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import {
  currentPlayerId,
  fetchChatroomPlayerIds,
  passTurn,
  turnAdvanceMode,
  isTurnActive,
  moveInOrder,
  removeTurn,
  saveTurn,
  skipTurn,
  upcomingPlayerIds,
  type ChatroomTurn,
} from "@/lib/chatroomTurns";

const turn = (over: Partial<ChatroomTurn> = {}): ChatroomTurn => ({
  chat_id: "c1",
  enabled: true,
  order_user_ids: ["a", "b", "c"],
  current_index: 1,
  ...over,
});

describe("ordre de passage — calculs", () => {
  it("joueur courant et suivants, en boucle", () => {
    expect(currentPlayerId(turn())).toBe("b");
    expect(upcomingPlayerIds(turn(), 2)).toEqual(["c", "a"]);
    expect(upcomingPlayerIds(turn({ current_index: 2 }), 5)).toEqual(["a", "b"]);
  });

  it("inactif : désactivé ou vide", () => {
    expect(isTurnActive(turn({ enabled: false }))).toBe(false);
    expect(isTurnActive(turn({ order_user_ids: [] }))).toBe(false);
    expect(currentPlayerId(null)).toBeNull();
    expect(upcomingPlayerIds(turn({ enabled: false }))).toEqual([]);
  });

  it("mode de passage : au premier message par défaut", () => {
    expect(turnAdvanceMode(turn())).toBe("message");
    expect(turnAdvanceMode(turn({ advance_mode: "manual" }))).toBe("manual");
    expect(turnAdvanceMode(null)).toBe("message");
  });

  it("moveInOrder déplace sans muter, bornes respectées", () => {
    const l = ["a", "b", "c"];
    expect(moveInOrder(l, 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(l, 2, -2)).toEqual(["c", "a", "b"]);
    expect(moveInOrder(l, 0, -1)).toEqual(["a", "b", "c"]);
    expect(l).toEqual(["a", "b", "c"]);
  });
});

describe("ordre de passage — base", () => {
  it("saveTurn : upsert sur le salon", async () => {
    const mock = createSupabaseMock({ results: [{ data: turn({ current_index: 0 }) }] });
    const res = await saveTurn(mock.client as never, "c1", { enabled: true, order_user_ids: ["a"], current_index: 0 });
    expect(mock.builders[0].builder.upsert).toHaveBeenCalledWith(
      { chat_id: "c1", enabled: true, order_user_ids: ["a"], current_index: 0 },
      { onConflict: "chat_id" },
    );
    expect(res.turn?.chat_id).toBe("c1");
  });

  it("skipTurn : index suivant (la base le ramène dans les bornes)", async () => {
    const mock = createSupabaseMock({ results: [{ data: turn({ current_index: 2 }) }] });
    await skipTurn(mock.client as never, turn());
    expect(mock.builders[0].builder.update).toHaveBeenCalledWith({ current_index: 2 });
  });

  it("saveTurn : enregistre le mode de passage", async () => {
    const mock = createSupabaseMock({ results: [{ data: turn({ advance_mode: "manual" }) }] });
    await saveTurn(mock.client as never, "c1", { enabled: true, advance_mode: "manual", order_user_ids: ["a"], current_index: 0 });
    expect(mock.builders[0].builder.upsert).toHaveBeenCalledWith(
      { chat_id: "c1", enabled: true, advance_mode: "manual", order_user_ids: ["a"], current_index: 0 },
      { onConflict: "chat_id" },
    );
  });

  it("passTurn : le joueur courant passe la main par la base", async () => {
    const mock = createSupabaseMock();
    mock.client.rpc.mockResolvedValue({ data: turn({ current_index: 2 }), error: null });
    const res = await passTurn(mock.client as never, "c1");
    expect(mock.client.rpc).toHaveBeenCalledWith("pass_chatroom_turn", { p_chat_id: "c1" });
    expect(res.turn?.current_index).toBe(2);
  });

  it("passTurn : rend l'erreur de la base", async () => {
    const mock = createSupabaseMock();
    mock.client.rpc.mockResolvedValue({ data: null, error: { message: "ce n'est pas votre tour" } });
    expect(await passTurn(mock.client as never, "c1")).toEqual({ turn: null, error: "ce n'est pas votre tour" });
  });

  it("removeTurn : désactive et vide au lieu de supprimer (UPDATE filtrable en temps réel)", async () => {
    const mock = createSupabaseMock({ results: [{ data: turn({ enabled: false, order_user_ids: [] }) }] });
    await removeTurn(mock.client as never, "c1");
    expect(mock.builders[0].builder.update).toHaveBeenCalledWith({ enabled: false, order_user_ids: [], current_index: 0 });
    expect(mock.builders[0].builder.delete).not.toHaveBeenCalled();
  });
});

describe("ordre de passage — joueurs du salon", () => {
  it("fetchChatroomPlayerIds : les invités et participants rendus par la base", async () => {
    const mock = createSupabaseMock();
    mock.client.rpc.mockResolvedValue({ data: ["a", "b"], error: null });
    const ids = await fetchChatroomPlayerIds(mock.client as never, "c1");
    expect(mock.client.rpc).toHaveBeenCalledWith("list_chatroom_player_ids", { p_chat_id: "c1" });
    expect(ids).toEqual(["a", "b"]);
  });

  it("fetchChatroomPlayerIds : une erreur ne propose personne", async () => {
    const mock = createSupabaseMock();
    mock.client.rpc.mockResolvedValue({ data: null, error: { message: "refusé" } });
    const error = console.error;
    console.error = () => {};
    try {
      expect(await fetchChatroomPlayerIds(mock.client as never, "c1")).toEqual([]);
    } finally {
      console.error = error;
    }
  });
});
