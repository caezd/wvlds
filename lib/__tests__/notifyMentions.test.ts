import { describe, it, expect, vi } from "vitest";

import { createSupabaseMock } from "@/test/supabaseMock";
import { notifyMentions } from "@/lib/notifyMentions";

const ROLES = [{ id: "mj", name: "Maître du jeu" }];
const BASE = {
  messageId: 42,
  chatId: "c1",
  worldId: "w1",
  selfId: "me",
  selfUsername: "moi",
  roles: ROLES,
  onlineMemberIds: ["u1", "u2"],
};

describe("notifyMentions", () => {
  it("ne fait rien sans mention", async () => {
    const mock = createSupabaseMock();
    await notifyMentions(mock.client as never, { ...BASE, text: "rien à voir" });
    expect(mock.client.from).not.toHaveBeenCalled();
    expect(mock.client.rpc).not.toHaveBeenCalled();
  });

  it("un @pseudo : notifications `mention` pour les membres du monde, jamais pour soi", async () => {
    // profiles → chatrooms → world_members → notifications
    const mock = createSupabaseMock({
      results: [
        { data: [{ id: "u1" }, { id: "me" }] },
        { data: { title: "Taverne", name: null } },
        { data: [{ user_id: "u1" }] },
        { data: null },
      ],
    });
    await notifyMentions(mock.client as never, { ...BASE, text: "salut @alice et @moi" });
    const notif = mock.builders.find((b) => b.table === "notifications")!;
    expect(notif.builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ recipient_id: "u1", type: "mention", message_id: 42, content: "Taverne", actor_name: "moi" }),
    ]);
    expect(mock.client.rpc).not.toHaveBeenCalled();
  });

  it("un rôle, @tous : la RPC de groupe, sans présents quand @tous l'emporte", async () => {
    const mock = createSupabaseMock();
    mock.client.rpc.mockResolvedValue({ data: 3, error: null });
    await notifyMentions(mock.client as never, { ...BASE, text: "@Maître du jeu @tous @ici" });
    expect(mock.client.rpc).toHaveBeenCalledWith("notify_group_mentions", {
      p_message_id: 42,
      p_role_ids: ["mj"],
      p_everyone: true,
      p_here_ids: [],
    });
    expect(mock.client.from).not.toHaveBeenCalled();
  });

  it("@ici seul : les présents sont transmis", async () => {
    const mock = createSupabaseMock();
    mock.client.rpc.mockResolvedValue({ data: 2, error: null });
    await notifyMentions(mock.client as never, { ...BASE, text: "@ici on joue ?" });
    expect(mock.client.rpc).toHaveBeenCalledWith("notify_group_mentions", expect.objectContaining({ p_everyone: false, p_here_ids: ["u1", "u2"] }));
  });

  it("un échec de la RPC se journalise sans lever", async () => {
    const mock = createSupabaseMock();
    mock.client.rpc.mockResolvedValue({ data: null, error: { message: "refusé" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyMentions(mock.client as never, { ...BASE, text: "@tous" })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
