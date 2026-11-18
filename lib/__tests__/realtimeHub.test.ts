import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/client";
import { __resetRealtimeChannels } from "@/lib/realtimeChannel";
import { subscribeTopic, useTopic, __resetRealtimeHub, __hubTopicCount } from "@/lib/realtimeHub";
import { renderHook, act } from "@testing-library/react";

let mock: SupabaseMock;

beforeEach(() => {
  vi.clearAllMocks();
  __resetRealtimeChannels();
  __resetRealtimeHub();
  mock = createSupabaseMock({ user: { id: "me" }, results: [] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
});

/** Diffuse un événement sur le canal `topic`, comme le ferait la base. */
function diffuser(topic: string, event: string, payload: Record<string, unknown>) {
  mock.channelNamed(topic)!.emit((h) => h.type === "broadcast", { event, payload });
}

describe("realtimeHub", () => {
  it("ouvre UN canal privé par sujet, partagé par ses abonnés", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeTopic("world:w1", { onEvent: a });
    subscribeTopic("world:w1", { onEvent: b });

    expect(mock.channels.filter((c) => c.name === "world:w1")).toHaveLength(1);
    expect(mock.client.channel).toHaveBeenCalledWith("world:w1", { config: { private: true } });
    // Écoute de tous les événements, posée avant la souscription.
    expect(mock.channelNamed("world:w1")!.handlers).toEqual([
      expect.objectContaining({ type: "broadcast", config: { event: "*" } }),
    ]);

    diffuser("world:w1", "chatroom", { op: "UPDATE", id: "c1" });
    expect(a).toHaveBeenCalledWith({ event: "chatroom", payload: { op: "UPDATE", id: "c1" } });
    expect(b).toHaveBeenCalledWith({ event: "chatroom", payload: { op: "UPDATE", id: "c1" } });
  });

  it("referme le canal au départ du dernier abonné seulement", async () => {
    const quitterA = subscribeTopic("world:w1", { onEvent: vi.fn() });
    const quitterB = subscribeTopic("world:w1", { onEvent: vi.fn() });

    quitterA();
    expect(mock.client.removeChannel).not.toHaveBeenCalled();
    expect(__hubTopicCount()).toBe(1);

    quitterB();
    expect(mock.client.removeChannel).toHaveBeenCalledTimes(1);
    expect(__hubTopicCount()).toBe(0);
    // Un double désabonnement ne referme rien de plus.
    quitterB();
    expect(mock.client.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("un abonné arrivé sur un canal déjà joint est prévenu qu'il l'est", () => {
    const premier = vi.fn();
    subscribeTopic("msgs:me", { onEvent: vi.fn(), onSubscribed: premier });
    expect(premier).toHaveBeenCalledTimes(1);

    const second = vi.fn();
    subscribeTopic("msgs:me", { onEvent: vi.fn(), onSubscribed: second });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("un abonné parti ne reçoit plus rien, les autres si", () => {
    const parti = vi.fn();
    const reste = vi.fn();
    const quitter = subscribeTopic("world:w1", { onEvent: parti });
    subscribeTopic("world:w1", { onEvent: reste });
    quitter();
    diffuser("world:w1", "live", { op: "INSERT" });
    expect(parti).not.toHaveBeenCalled();
    expect(reste).toHaveBeenCalledTimes(1);
  });

  it("des sujets différents ont des canaux différents", () => {
    const monde = vi.fn();
    const page = vi.fn();
    subscribeTopic("world:w1", { onEvent: monde });
    subscribeTopic("wiki:p1", { onEvent: page });
    diffuser("wiki:p1", "note", { op: "INSERT", id: "n1" });
    expect(page).toHaveBeenCalledTimes(1);
    expect(monde).not.toHaveBeenCalled();
  });
  it("useTopic : onResync à chaque re-jonction du canal, jamais à la première", async () => {
    const onResync = vi.fn();
    renderHook(() => useTopic("world:w1", vi.fn(), { onResync }));
    expect(onResync).not.toHaveBeenCalled();

    // Re-jonction automatique de supabase-js après une coupure brève : le
    // même canal repasse SUBSCRIBED.
    const ch = mock.channelNamed("world:w1")!;
    const rappel = vi.mocked(ch.subscribe).mock.calls[0][0] as (s: string) => void;
    act(() => rappel("CHANNEL_ERROR"));
    act(() => rappel("SUBSCRIBED"));
    expect(onResync).toHaveBeenCalledTimes(1);

    act(() => rappel("SUBSCRIBED"));
    expect(onResync).toHaveBeenCalledTimes(2);
  });

  it("useTopic : un changement de sujet repart d'une première jonction", () => {
    const onResync = vi.fn();
    const { rerender } = renderHook(({ t }) => useTopic(t, vi.fn(), { onResync }), {
      initialProps: { t: "world:w1" },
    });
    rerender({ t: "world:w2" });
    expect(onResync).not.toHaveBeenCalled();
  });
});
