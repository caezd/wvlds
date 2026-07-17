import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAppShell } from "@/lib/appShell";
import { createSupabaseMock } from "@/test/supabaseMock";

const SHELL_ROW = {
  world_ids: ["w1"],
  room_unreads: [{ chat_id: "c1", world_id: "w1", unread_messages: 2, never_opened: false }],
  notification_preferences: [],
  notifications: [],
  dm_conversations: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchAppShell", () => {
  it("appelle la RPC get_app_shell et renvoie son résultat", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    mock.client.rpc.mockResolvedValue({ data: SHELL_ROW, error: null });

    const result = await fetchAppShell(mock.client as never, "u1");
    expect(mock.client.rpc).toHaveBeenCalledWith("get_app_shell", { p_notif_limit: 20 });
    expect(result).toEqual(SHELL_ROW);
  });

  it("dédoublonne les appels concurrents pour le même utilisateur (une seule requête réseau)", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    let resolveRpc!: (v: { data: unknown; error: null }) => void;
    mock.client.rpc.mockReturnValue(new Promise((r) => { resolveRpc = r; }));

    const p1 = fetchAppShell(mock.client as never, "u1");
    const p2 = fetchAppShell(mock.client as never, "u1");

    expect(mock.client.rpc).toHaveBeenCalledTimes(1);

    resolveRpc({ data: SHELL_ROW, error: null });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(SHELL_ROW);
    expect(r2).toEqual(SHELL_ROW);
  });

  it("ne dédoublonne pas entre deux utilisateurs différents", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    mock.client.rpc.mockResolvedValue({ data: SHELL_ROW, error: null });

    await Promise.all([
      fetchAppShell(mock.client as never, "u1"),
      fetchAppShell(mock.client as never, "u2"),
    ]);
    expect(mock.client.rpc).toHaveBeenCalledTimes(2);
  });

  it("relance une requête après résolution de la précédente", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    mock.client.rpc.mockResolvedValue({ data: SHELL_ROW, error: null });

    await fetchAppShell(mock.client as never, "u1");
    await fetchAppShell(mock.client as never, "u1");
    expect(mock.client.rpc).toHaveBeenCalledTimes(2);
  });

  it("renvoie un shell vide si la RPC échoue", async () => {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    mock.client.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await fetchAppShell(mock.client as never, "u1");
    expect(result).toEqual({
      world_ids: [],
      room_unreads: [],
      notification_preferences: [],
      notifications: [],
      dm_conversations: [],
    });
  });
});
