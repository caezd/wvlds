import { describe, it, expect } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import {
  currentPlayerId,
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

  it("removeTurn : désactive et vide au lieu de supprimer (UPDATE filtrable en temps réel)", async () => {
    const mock = createSupabaseMock({ results: [{ data: turn({ enabled: false, order_user_ids: [] }) }] });
    await removeTurn(mock.client as never, "c1");
    expect(mock.builders[0].builder.update).toHaveBeenCalledWith({ enabled: false, order_user_ids: [], current_index: 0 });
    expect(mock.builders[0].builder.delete).not.toHaveBeenCalled();
  });
});
