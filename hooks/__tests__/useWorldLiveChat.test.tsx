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

import { useWorldLiveChat, mergeMessage, LIVE_CHAT_PAGE, type LiveChatMessage } from "@/hooks/useWorldLiveChat";
import { LIVE_CHAT_RETENTION_MAX } from "@/lib/worldLiveChatRetention";
import { createClient } from "@/lib/supabase/client";
import { __resetRealtimeChannels } from "@/lib/realtimeChannel";
import { __resetRealtimeHub } from "@/lib/realtimeHub";

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

const isLive = (h: { type: string; config: Record<string, unknown> }) =>
  h.type === "broadcast" && h.config.event === "*";
const isSync = (h: { type: string; config: Record<string, unknown> }) =>
  h.type === "presence" && h.config.event === "sync";

beforeEach(() => {
  vi.clearAllMocks();
  __resetRealtimeChannels();
  __resetRealtimeHub();
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
    // Les messages arrivent par le canal privé du monde (migration 214).
    await waitFor(() => expect(mock.channelNamed("world:w1")).toBeDefined());
    const ch = mock.channelNamed("world:w1")!;
    act(() => ch.emit(isLive, { event: "live", payload: { op: "INSERT", record: row("c", "u3", "2026-11-09T10:02:00Z", null) } }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].author?.username).toBe("carol");
  });

  it("retire un message effacé", async () => {
    const { result, mock } = setup([{ data: [row("a", "u1", "2026-11-09T10:00:00Z")] }]);
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    const ch = mock.channelNamed("world:w1")!;
    act(() => ch.emit(isLive, { event: "live", payload: { op: "DELETE", id: "a" } }));
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

  it("ouvre le canal de présence du chat en privé (migration 220)", async () => {
    const { mock } = setup([{ data: [] }]);
    await waitFor(() => expect(mock.channelNamed("world-live:w1")).toBeDefined());
    expect(mock.channel).toHaveBeenCalledWith(
      "world-live:w1",
      expect.objectContaining({ config: expect.objectContaining({ private: true }) }),
    );
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
    act(() => mock.channelNamed("world:w1")!.emit(isLive, { event: "live", payload: { op: "INSERT", record: sent } }));
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

describe("useWorldLiveChat — salles et fils de salon (migration 238)", () => {
  function setupAt(results: QueryResult[], place: Parameters<typeof useWorldLiveChat>[1]) {
    const mock = createSupabaseMock({ user: { id: "me" }, results });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const view = renderHook(() => useWorldLiveChat("w1", place));
    return { mock, ...view };
  }

  it("la salle principale ne lit que les messages sans salle ni salon", async () => {
    const { mock } = setupAt([{ data: [] }], { kind: "main" });
    await waitFor(() => expect(mock.buildersFor("world_live_messages")).toHaveLength(1));
    const b = mock.buildersFor("world_live_messages")[0];
    expect(b.is).toHaveBeenCalledWith("channel_id", null);
    expect(b.is).toHaveBeenCalledWith("chatroom_id", null);
  });

  it("une salle ne lit que les siens ; un message d'ailleurs la laisse intacte et se signale", async () => {
    const { result, mock } = setupAt([{ data: [] }], { kind: "channel", id: "c1" });
    await waitFor(() => expect(mock.channelNamed("world:w1")).toBeDefined());
    expect(mock.buildersFor("world_live_messages")[0].eq).toHaveBeenCalledWith("channel_id", "c1");
    const ch = mock.channelNamed("world:w1")!;
    act(() => ch.emit(isLive, { event: "live", payload: { op: "INSERT", record: { ...row("x", "u2", "2026-11-09T10:00:00Z"), channel_id: null, chatroom_id: null } } }));
    act(() => ch.emit(isLive, { event: "live", payload: { op: "INSERT", record: { ...row("y", "u2", "2026-11-09T10:00:01Z"), channel_id: "c2", chatroom_id: null } } }));
    await waitFor(() => expect(result.current.unread.has("main")).toBe(true));
    expect(result.current.unread.has("c:c2")).toBe(true);
    expect(result.current.messages).toHaveLength(0);
  });

  it("le fil d'un salon : l'avis arrive sans contenu, le message est relu", async () => {
    const relu = { ...row("r", "u2", "2026-11-09T10:00:00Z", "bob"), chatroom_id: "r1", channel_id: null, reply_to_id: null, reply: null };
    const { result, mock } = setupAt([{ data: [] }, { data: relu }], { kind: "chatroom", id: "r1" });
    await waitFor(() => expect(mock.channelNamed("world:w1")).toBeDefined());
    expect(mock.buildersFor("world_live_messages")[0].eq).toHaveBeenCalledWith("chatroom_id", "r1");
    const ch = mock.channelNamed("world:w1")!;
    act(() => ch.emit(isLive, { event: "live", payload: { op: "INSERT", id: "r", chatroom_id: "r1" } }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(mock.buildersFor("world_live_messages")[1].eq).toHaveBeenCalledWith("id", "r");
    expect(result.current.messages[0].author?.username).toBe("bob");
  });

  it("une salle réservée à un groupe : l'avis arrive sans contenu, le message est relu (migration 243)", async () => {
    const relu = { ...row("g", "u2", "2026-11-09T10:00:00Z", "bob"), channel_id: "c1", chatroom_id: null, reply_to_id: null, reply: null };
    const { result, mock } = setupAt([{ data: [] }, { data: relu }], { kind: "channel", id: "c1" });
    await waitFor(() => expect(mock.channelNamed("world:w1")).toBeDefined());
    const ch = mock.channelNamed("world:w1")!;
    act(() => ch.emit(isLive, { event: "live", payload: { op: "INSERT", id: "g", channel_id: "c1", chatroom_id: null } }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(mock.buildersFor("world_live_messages")[1].eq).toHaveBeenCalledWith("id", "g");
    // Ailleurs, l'avis se signale sans rien lire.
    act(() => ch.emit(isLive, { event: "live", payload: { op: "INSERT", id: "h", channel_id: "c2", chatroom_id: null } }));
    await waitFor(() => expect(result.current.unread.has("c:c2")).toBe(true));
    expect(mock.buildersFor("world_live_messages")).toHaveLength(2);
  });

  it("envoie dans la salle choisie, avec la réponse", async () => {
    const sent = { ...row("n", "me", "2026-11-09T10:00:00Z", "moi"), channel_id: "c1", chatroom_id: null, reply_to_id: "m1", reply: null };
    const { result, mock } = setupAt([{ data: [] }, { data: sent }], { kind: "channel", id: "c1" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(await result.current.send("coucou", "m1")).toBe("ok");
    });
    const insertBuilder = mock.buildersFor("world_live_messages")[1];
    expect(insertBuilder.insert).toHaveBeenCalledWith({ world_id: "w1", user_id: "me", content: "coucou", channel_id: "c1", reply_to_id: "m1" });
  });

  it("envoie la couleur, le persona et l'action demandés (migration 241)", async () => {
    const sent = { ...row("n", "me", "2026-11-09T10:00:00Z", "moi"), channel_id: null, chatroom_id: null, reply_to_id: null, reply: null };
    const { result, mock } = setupAt([{ data: [] }, { data: sent }], { kind: "main" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(await result.current.send("se lève", null, { color: "#f87171", personaId: "p1", isAction: true })).toBe("ok");
    });
    expect(mock.buildersFor("world_live_messages")[1].insert).toHaveBeenCalledWith({
      world_id: "w1", user_id: "me", content: "se lève", color: "#f87171", persona_id: "p1", is_action: true,
    });
  });

  it("un persona refusé par la base se dit", async () => {
    const { result } = setupAt([{ data: [] }, { data: null, error: { message: "Ce persona ne peut pas écrire ici." } }], { kind: "main" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      expect(await result.current.send("salut", null, { personaId: "p9" })).toBe("persona");
    });
  });

  it("un message reçu en direct retrouve son persona", async () => {
    const { result, mock } = setupAt(
      [{ data: [] }, { data: { id: "p1", name: "Lyra", avatar_url: "lyra.png" } }],
      { kind: "main" },
    );
    await waitFor(() => expect(mock.channelNamed("world:w1")).toBeDefined());
    const ch = mock.channelNamed("world:w1")!;
    const record = { ...row("x", "me", "2026-11-09T10:05:00Z", "moi"), channel_id: null, chatroom_id: null, persona_id: "p1", is_action: false };
    act(() => ch.emit(isLive, { event: "live", payload: { op: "INSERT", record } }));
    await waitFor(() => expect(result.current.messages[0]?.persona?.name).toBe("Lyra"));
    expect(mock.from).toHaveBeenCalledWith("personas");
  });

  it("un message cité qui disparaît : la citation le dit", async () => {
    const m1 = { ...row("m1", "u2", "2026-11-09T10:00:00Z"), channel_id: null, chatroom_id: null, reply_to_id: null, reply: null };
    const m2 = { ...row("m2", "u3", "2026-11-09T10:01:00Z"), channel_id: null, chatroom_id: null, reply_to_id: "m1", reply: { id: "m1", content: "msg m1", user_id: "u2", profiles: { username: "u2" } } };
    const { result, mock } = setupAt([{ data: [m2, m1] }], { kind: "main" });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[1].reply?.username).toBe("u2");
    act(() => mock.channelNamed("world:w1")!.emit(isLive, { event: "live", payload: { op: "DELETE", id: "m1" } }));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].reply).toBeNull();
  });
});

describe("useWorldLiveChat — remontée de l'historique (migration 240)", () => {
  /** `n` messages, du plus récent au plus ancien, comme les rend la requête. */
  const page = (n: number, offset = 0) =>
    Array.from({ length: n }, (_, i) => {
      const k = offset + i;
      return row(`m${k}`, "u1", new Date(Date.UTC(2026, 10, 9, 12, 0, 0) - k * 60_000).toISOString());
    });

  it("une page incomplète : rien de plus ancien à chercher", async () => {
    const { result } = setup([{ data: page(10) }]);
    await waitFor(() => expect(result.current.messages).toHaveLength(10));
    expect(result.current.hasOlder).toBe(false);
  });

  it("une page pleine laisse remonter ; la page suivante se lit avant le plus ancien", async () => {
    const { result, mock } = setup([{ data: page(LIVE_CHAT_PAGE) }, { data: page(20, LIVE_CHAT_PAGE) }]);
    await waitFor(() => expect(result.current.messages).toHaveLength(LIVE_CHAT_PAGE));
    expect(result.current.hasOlder).toBe(true);
    const oldest = result.current.messages[0];

    let read: number | null = -1;
    await act(async () => {
      read = await result.current.loadOlder();
    });
    expect(read).toBe(20);
    const b = mock.buildersFor("world_live_messages")[1];
    expect(b.lt).toHaveBeenCalledWith("created_at", oldest.created_at);
    expect(b.limit).toHaveBeenCalledWith(LIVE_CHAT_PAGE);
    expect(b.is).toHaveBeenCalledWith("channel_id", null);
    expect(result.current.messages).toHaveLength(LIVE_CHAT_PAGE + 20);
    // Toujours dans l'ordre chronologique, les anciens en tête.
    expect(result.current.messages[0].id).toBe(`m${LIVE_CHAT_PAGE + 19}`);
    expect(result.current.hasOlder).toBe(false);
  });

  it("jamais plus d'une page par lecture : le plafond de 100 tient en deux", () => {
    expect(LIVE_CHAT_PAGE * 2).toBeGreaterThanOrEqual(LIVE_CHAT_RETENTION_MAX);
    expect(LIVE_CHAT_PAGE).toBeLessThanOrEqual(LIVE_CHAT_RETENTION_MAX);
  });

  it("dans le fil d'un salon, la remontée ne lit que ce fil", async () => {
    const mock = createSupabaseMock({ user: { id: "me" }, results: [{ data: page(LIVE_CHAT_PAGE) }, { data: page(5, LIVE_CHAT_PAGE) }] });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const { result } = renderHook(() => useWorldLiveChat("w1", { kind: "chatroom", id: "r1" }));
    await waitFor(() => expect(result.current.hasOlder).toBe(true));
    await act(async () => {
      await result.current.loadOlder();
    });
    const b = mock.buildersFor("world_live_messages")[1];
    expect(b.eq).toHaveBeenCalledWith("chatroom_id", "r1");
    expect(b.is).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(LIVE_CHAT_PAGE + 5);
  });

  it("un échec de lecture se signale sans toucher au fil", async () => {
    const { result } = setup([{ data: page(LIVE_CHAT_PAGE) }, { data: null, error: { message: "boom" } }]);
    await waitFor(() => expect(result.current.messages).toHaveLength(LIVE_CHAT_PAGE));
    let read: number | null = -1;
    await act(async () => {
      read = await result.current.loadOlder();
    });
    expect(read).toBeNull();
    expect(result.current.messages).toHaveLength(LIVE_CHAT_PAGE);
    expect(result.current.hasOlder).toBe(true);
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
