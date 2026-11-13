import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock, type QueryResult } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    userId: "me",
    username: "moi",
    avatarUrl: null,
    appearOffline: false,
    plan: null,
    user: null,
    loading: false,
  }),
}));
const presenceMock = vi.hoisted(() => ({ appearOffline: false }));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ appearOffline: presenceMock.appearOffline }),
}));

import { useWorldLiveChat, mergeMessage, type LiveChatMessage } from "@/hooks/useWorldLiveChat";
import { createClient } from "@/lib/supabase/client";
import { __resetRealtimeChannels } from "@/lib/realtimeChannel";

const row = (id: string, user_id: string, created_at: string, username: string | null = user_id) => ({
  id,
  world_id: "w1",
  user_id,
  content: `msg ${id}`,
  created_at,
  profiles: username ? { username, avatar_url: null } : null,
});

function setup(results: QueryResult[], worldId: string | null = "w1") {
  const mock = createSupabaseMock({ user: { id: "me" }, results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const view = renderHook(() => useWorldLiveChat(worldId));
  return { mock, ...view };
}

const isInsert = (h: { type: string; config: Record<string, unknown> }) =>
  h.type === "postgres_changes" && h.config.event === "INSERT";
const isDelete = (h: { type: string; config: Record<string, unknown> }) =>
  h.type === "postgres_changes" && h.config.event === "DELETE";
const isSync = (h: { type: string; config: Record<string, unknown> }) =>
  h.type === "presence" && h.config.event === "sync";

beforeEach(() => {
  vi.clearAllMocks();
  __resetRealtimeChannels();
  presenceMock.appearOffline = false;
});

describe("useWorldLiveChat", () => {
  it("charge les derniers messages dans l'ordre chronologique, avec leur auteur", async () => {
    // La requête les rend du plus récent au plus ancien.
    const { result, mock } = setup([
      { data: [row("b", "u2", "2026-11-09T10:01:00Z", "bob"), row("a", "u1", "2026-11-09T10:00:00Z", "alice")] },
    ]);
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages.map((m) => m.id)).toEqual(["a", "b"]);
    expect(result.current.messages[0].author?.username).toBe("alice");
    expect(mock.from).toHaveBeenCalledWith("world_live_messages");
  });

  it("n'ouvre rien sans monde", () => {
    const { mock } = setup([], null);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.client.channel).not.toHaveBeenCalled();
  });

  it("ajoute un message reçu en direct et retrouve son auteur inconnu", async () => {
    const { result, mock } = setup([{ data: [] }, { data: { username: "carol", avatar_url: null } }]);
    await waitFor(() => expect(mock.channelNamed("world-live:w1")).toBeDefined());
    const ch = mock.channelNamed("world-live:w1")!;
    act(() => ch.emit(isInsert, { new: row("c", "u3", "2026-11-09T10:02:00Z", null) }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].author?.username).toBe("carol");
  });

  it("retire un message effacé", async () => {
    const { result, mock } = setup([{ data: [row("a", "u1", "2026-11-09T10:00:00Z")] }]);
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    const ch = mock.channelNamed("world-live:w1")!;
    act(() => ch.emit(isDelete, { old: { id: "a" } }));
    expect(result.current.messages).toHaveLength(0);
  });

  it("compte les présents et s'y inscrit", async () => {
    const { result, mock } = setup([{ data: [] }]);
    await waitFor(() => expect(mock.channelNamed("world-live:w1")?.track).toHaveBeenCalledWith({ user_id: "me" }));
    const ch = mock.channelNamed("world-live:w1")!;
    ch.presence = { me: [{}], u2: [{}], u3: [{}] };
    act(() => ch.emit(isSync, {}));
    expect(result.current.presentCount).toBe(3);
  });

  it("en mode invisible, lit sans se compter", async () => {
    presenceMock.appearOffline = true;
    const { mock } = setup([{ data: [] }]);
    await waitFor(() => expect(mock.channelNamed("world-live:w1")?.subscribe).toHaveBeenCalled());
    expect(mock.channelNamed("world-live:w1")!.track).not.toHaveBeenCalled();
  });

  it("envoie un message et ne le double pas quand le temps réel le renvoie", async () => {
    const sent = row("s", "me", "2026-11-09T10:03:00Z", "moi");
    const { result, mock } = setup([{ data: [] }, { data: sent }]);
    await waitFor(() => expect(mock.channelNamed("world-live:w1")).toBeDefined());
    let res: string | undefined;
    await act(async () => { res = await result.current.send("  salut  "); });
    expect(res).toBe("ok");
    const insertBuilder = mock.from.mock.results[1].value as { insert: ReturnType<typeof vi.fn> };
    expect(insertBuilder.insert).toHaveBeenCalledWith({ world_id: "w1", user_id: "me", content: "salut" });
    act(() => mock.channelNamed("world-live:w1")!.emit(isInsert, { new: sent }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
  });

  it("signale le rythme dépassé", async () => {
    const { result } = setup([
      { data: [] },
      { data: null, error: { message: "Trop de messages : patientez un instant." } },
    ]);
    let res: string | undefined;
    await act(async () => { res = await result.current.send("encore"); });
    expect(res).toBe("too_fast");
  });

  it("n'envoie pas un message vide", async () => {
    const { result, mock } = setup([{ data: [] }]);
    let res: string | undefined;
    await act(async () => { res = await result.current.send("   "); });
    expect(res).toBe("error");
    expect(mock.from).toHaveBeenCalledTimes(1);
  });
});

describe("mergeMessage", () => {
  const m = (id: string, created_at: string): LiveChatMessage => ({
    id, world_id: "w1", user_id: "u", content: id, created_at, author: null,
  });

  it("range par date et ignore les doublons", () => {
    let list = [m("b", "2026-01-01T00:00:02Z")];
    list = mergeMessage(list, m("a", "2026-01-01T00:00:01Z"));
    list = mergeMessage(list, m("b", "2026-01-01T00:00:02Z"));
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("borne la mémoire aux 200 derniers", () => {
    let list: LiveChatMessage[] = [];
    for (let i = 0; i < 205; i++) list = mergeMessage(list, m(`m${i}`, new Date(1e12 + i * 1000).toISOString()));
    expect(list).toHaveLength(200);
    expect(list[0].id).toBe("m5");
  });
});
