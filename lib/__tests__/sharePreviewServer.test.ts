import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

import { getSharePreview } from "@/lib/sharePreviewServer";

const W = "f1e4d2c9-e56f-454a-bde2-8f9eade06e65";
const C = "0df5be1c-e6e1-4806-b0fc-211a9d14ac24";

beforeEach(() => rpc.mockReset());

describe("getSharePreview : aperçu public d'un monde ou d'un salon (migration 267)", () => {
  it("un monde : l'id du monde seul", async () => {
    rpc.mockResolvedValue({ data: { id: W, name: "Hextech", member_count: 2 }, error: null });
    const p = await getSharePreview({ kind: "world", id: W });
    expect(rpc).toHaveBeenCalledWith("get_world_share_preview", { p_world_id: W, p_chatroom_id: null });
    expect(p?.name).toBe("Hextech");
  });

  it("un salon : l'id du salon seul", async () => {
    rpc.mockResolvedValue({ data: { id: W, name: "Hextech", chatroom_name: "Taverne" }, error: null });
    const p = await getSharePreview({ kind: "chatroom", id: C });
    expect(rpc).toHaveBeenCalledWith("get_world_share_preview", { p_world_id: null, p_chatroom_id: C });
    expect(p?.chatroomName).toBe("Taverne");
  });

  it("une erreur de la base donne l'aperçu générique, sans faire tomber la page", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getSharePreview({ kind: "world", id: W })).toBeNull();
    spy.mockRestore();
  });
});
