import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "me", username: "moi", avatarUrl: null, loading: false }),
}));

import { useLiveChatSession } from "@/hooks/useLiveChatSession";
import { createClient } from "@/lib/supabase/client";
import { __resetRealtimeChannels } from "@/lib/realtimeChannel";
import { __resetRealtimeHub } from "@/lib/realtimeHub";

const isLive = (h: { type: string; config: Record<string, unknown> }) =>
  h.type === "broadcast" && h.config.event === "*";

type Settings = { live_chat_join_mode: string; live_chat_idle_minutes: number | null; live_chat_offline_view: string };
type Rpcs = Record<string, (args: Record<string, unknown>) => { data: unknown; error?: unknown }>;

function setup(settings: Settings, rpcs: Rpcs = {}) {
  const mock = createSupabaseMock({ user: { id: "me" }, results: [{ data: settings }] });
  mock.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) =>
    rpcs[name] ? { error: null, ...rpcs[name](args) } : { data: null, error: null },
  );
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const view = renderHook(() => useLiveChatSession("w1"));
  return { mock, ...view };
}

const callsOf = (mock: ReturnType<typeof createSupabaseMock>, name: string) =>
  mock.rpc.mock.calls.filter(([n]) => n === name);

const now = () => new Date().toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  __resetRealtimeChannels();
  __resetRealtimeHub();
});

describe("useLiveChatSession", () => {
  it("connexion à l'arrivée, sans délai : rien n'est tenu, aucun appel", async () => {
    const { result, mock } = setup({ live_chat_join_mode: "auto", live_chat_idle_minutes: null, live_chat_offline_view: "none" });
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(result.current.connection).toEqual({ joinMode: "auto", idleMinutes: null, offlineView: "none" });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("tant que les réglages ne sont pas lus : en attente", () => {
    const { result } = setup({ live_chat_join_mode: "button", live_chat_idle_minutes: null, live_chat_offline_view: "none" });
    expect(result.current.status).toBe("loading");
    expect(result.current.connection).toBeNull();
  });

  it("mode Rejoindre : non connecté ; « Rejoindre » ouvre la connexion avec un message d'arrivée", async () => {
    const { result, mock } = setup(
      { live_chat_join_mode: "button", live_chat_idle_minutes: null, live_chat_offline_view: "read" },
      { world_live_chat_session: () => ({ data: null }), join_world_live_chat: () => ({ data: now() }) },
    );
    await waitFor(() => expect(result.current.status).toBe("away"));
    expect(callsOf(mock, "join_world_live_chat")).toHaveLength(0);
    let res: string | undefined;
    await act(async () => { res = await result.current.join(); });
    expect(res).toBe("ok");
    expect(mock.rpc).toHaveBeenCalledWith("join_world_live_chat", { p_world: "w1", p_announce: true });
    expect(result.current.status).toBe("joined");
  });

  it("déjà connecté (rechargement) : reste connecté, sans rejoindre", async () => {
    const { result, mock } = setup(
      { live_chat_join_mode: "button", live_chat_idle_minutes: null, live_chat_offline_view: "none" },
      { world_live_chat_session: () => ({ data: now() }) },
    );
    await waitFor(() => expect(result.current.status).toBe("joined"));
    expect(callsOf(mock, "join_world_live_chat")).toHaveLength(0);
  });

  it("connexion à l'arrivée : un délai enregistré ne compte pas, rien n'est tenu", async () => {
    const { result, mock } = setup({ live_chat_join_mode: "auto", live_chat_idle_minutes: 10, live_chat_offline_view: "read" });
    await waitFor(() => expect(result.current.status).toBe("off"));
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("« Quitter » ferme la connexion", async () => {
    const { result, mock } = setup(
      { live_chat_join_mode: "button", live_chat_idle_minutes: null, live_chat_offline_view: "none" },
      { world_live_chat_session: () => ({ data: now() }) },
    );
    await waitFor(() => expect(result.current.status).toBe("joined"));
    await act(async () => { await result.current.leave(); });
    expect(mock.rpc).toHaveBeenCalledWith("leave_world_live_chat", { p_world: "w1" });
    expect(result.current.status).toBe("away");
  });

  it("rejoindre trop vite après être parti : le dit, reste dehors", async () => {
    const { result } = setup(
      { live_chat_join_mode: "button", live_chat_idle_minutes: null, live_chat_offline_view: "none" },
      {
        world_live_chat_session: () => ({ data: null }),
        join_world_live_chat: () => ({ data: null, error: { message: "Trop de messages : patientez un instant." } }),
      },
    );
    await waitFor(() => expect(result.current.status).toBe("away"));
    let res: string | undefined;
    await act(async () => { res = await result.current.join(); });
    expect(res).toBe("too_fast");
    expect(result.current.status).toBe("away");
  });

  it("à l'échéance de l'inactivité, relit l'état : déconnecté", async () => {
    // Dernière activité il y a une minute moins 50 ms, délai d'une minute.
    const last = new Date(Date.now() - 60_000 + 50).toISOString();
    let reads = 0;
    const { result, mock } = setup(
      { live_chat_join_mode: "button", live_chat_idle_minutes: 1, live_chat_offline_view: "none" },
      { world_live_chat_session: () => ({ data: reads++ === 0 ? last : null }) },
    );
    await waitFor(() => expect(result.current.status).toBe("joined"));
    await waitFor(() => expect(result.current.status).toBe("away"));
    expect(callsOf(mock, "world_live_chat_session")).toHaveLength(2);
  });

  it("un message système à son nom (autre onglet, tâche planifiée) suit l'état", async () => {
    const { result, mock } = setup(
      { live_chat_join_mode: "button", live_chat_idle_minutes: 30, live_chat_offline_view: "none" },
      { world_live_chat_session: () => ({ data: now() }) },
    );
    await waitFor(() => expect(result.current.status).toBe("joined"));
    await waitFor(() => expect(mock.channelNamed("world:w1")).toBeDefined());
    const ch = mock.channelNamed("world:w1")!;
    const record = (id: string, user_id: string, system: string) => ({
      id, world_id: "w1", user_id, content: system, system, created_at: now(), channel_id: null, chatroom_id: null,
    });
    // Celui d'un autre joueur ne change rien.
    act(() => ch.emit(isLive, { event: "live", payload: { op: "INSERT", record: record("m1", "u2", "idle") } }));
    expect(result.current.status).toBe("joined");
    act(() => ch.emit(isLive, { event: "live", payload: { op: "INSERT", record: record("m2", "me", "idle") } }));
    expect(result.current.status).toBe("away");
    act(() => ch.emit(isLive, { event: "live", payload: { op: "INSERT", record: record("m3", "me", "join") } }));
    expect(result.current.status).toBe("joined");
  });

  it("la frappe repousse la déconnexion, au plus une fois par minute", async () => {
    const { result, mock } = setup(
      { live_chat_join_mode: "button", live_chat_idle_minutes: 30, live_chat_offline_view: "none" },
      { world_live_chat_session: () => ({ data: now() }), touch_world_live_chat: () => ({ data: now() }) },
    );
    await waitFor(() => expect(result.current.status).toBe("joined"));
    act(() => {
      result.current.activity();
      result.current.activity();
      result.current.activity();
    });
    await waitFor(() => expect(callsOf(mock, "touch_world_live_chat")).toHaveLength(1));
    expect(mock.rpc).toHaveBeenCalledWith("touch_world_live_chat", { p_world: "w1" });
  });

  it("sans délai d'inactivité, la frappe n'appelle rien", async () => {
    const { result, mock } = setup(
      { live_chat_join_mode: "button", live_chat_idle_minutes: null, live_chat_offline_view: "none" },
      { world_live_chat_session: () => ({ data: now() }) },
    );
    await waitFor(() => expect(result.current.status).toBe("joined"));
    act(() => result.current.activity());
    expect(callsOf(mock, "touch_world_live_chat")).toHaveLength(0);
  });
});
