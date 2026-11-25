import { describe, it, expect, vi } from "vitest";

import { createSupabaseMock } from "@/test/supabaseMock";
import { notifyMentions } from "@/lib/notifyMentions";

const ROLES = [{ id: "mj", name: "Maître du jeu" }];
const BASE = {
  messageId: 42,
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

  it("un @pseudo : la RPC des mentions reçoit le message et les pseudos, sans écriture directe", async () => {
    // Destinataires, nom de l'expéditeur et titre du salon sont établis par la
    // base : le client ne peut plus rien en choisir.
    const mock = createSupabaseMock();
    mock.client.rpc.mockResolvedValue({ data: 1, error: null });
    await notifyMentions(mock.client as never, { ...BASE, text: "salut @alice et @moi" });
    expect(mock.client.rpc).toHaveBeenCalledWith("notify_user_mentions", {
      p_message_id: 42,
      p_usernames: ["alice", "moi"],
    });
    expect(mock.client.from).not.toHaveBeenCalled();
  });

  it("pseudos et groupe dans le même message : les deux RPC", async () => {
    const mock = createSupabaseMock();
    mock.client.rpc.mockResolvedValue({ data: 1, error: null });
    await notifyMentions(mock.client as never, { ...BASE, text: "@alice @tous" });
    expect(mock.client.rpc).toHaveBeenCalledWith("notify_user_mentions", expect.objectContaining({ p_usernames: ["alice"] }));
    expect(mock.client.rpc).toHaveBeenCalledWith("notify_group_mentions", expect.objectContaining({ p_everyone: true }));
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
