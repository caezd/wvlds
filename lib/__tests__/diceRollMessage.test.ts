import { describe, it, expect, vi } from "vitest";

import { rollDiceForMessage } from "@/lib/diceRollMessage";

const ROW = {
  id: "r1", world_id: "w1", chat_id: "c1", user_id: "u1", die_id: "d6", die_name: "d6",
  min_value: 1, max_value: 6, count: 2, modifier: 1, results: [3, 4], total: 8, created_at: "2026-11-26T00:00:00Z",
};

function client(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

describe("rollDiceForMessage", () => {
  it("fait tirer un dé du monde par la base, et rend le texte du message", async () => {
    const supabase = client({ data: ROW, error: null });
    const res = await rollDiceForMessage(supabase, "c1", { dieId: "d6", count: 2, modifier: 1, label: "Attaque" });
    expect(supabase.rpc).toHaveBeenCalledWith("roll_dice", {
      p_chat: "c1", p_die: "d6", p_count: 2, p_modifier: 1, p_faces: null,
    });
    expect(res).toEqual({
      ok: true,
      diceRollId: "r1",
      text: JSON.stringify({ _type: "dice", roll_id: "r1", formula: "2d6+1", results: [3, 4], modifier: 1, total: 8, label: "Attaque" }),
    });
  });

  it("une formule libre passe son nombre de faces", async () => {
    const supabase = client({ data: { ...ROW, die_id: null, die_name: null, max_value: 20, count: 1, modifier: 0, results: [9], total: 9 }, error: null });
    await rollDiceForMessage(supabase, "c1", { faces: 20, count: 1, modifier: 0 });
    expect(supabase.rpc).toHaveBeenCalledWith("roll_dice", {
      p_chat: "c1", p_die: null, p_count: 1, p_modifier: 0, p_faces: 20,
    });
  });

  it("un refus de la base devient une clé de message", async () => {
    const supabase = client({ data: null, error: { message: "dice_predefined_only" } });
    const res = await rollDiceForMessage(supabase, "c1", { faces: 20, count: 1, modifier: 0 });
    expect(res).toEqual({ ok: false, error: "predefinedOnly" });
  });
});
