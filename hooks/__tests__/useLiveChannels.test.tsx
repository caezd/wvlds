import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

import { useLiveChannels } from "@/hooks/useLiveChannels";
import { createClient } from "@/lib/supabase/client";
import { __resetRealtimeChannels } from "@/lib/realtimeChannel";
import { __resetRealtimeHub } from "@/lib/realtimeHub";
import type { LiveChannel } from "@/lib/worldLiveChannels";

const salle = (id: string, name: string, sort_index: number, group_id: string | null = null): LiveChannel => ({
  id, world_id: "w1", name, color: null, icon: null, sort_index, group_id,
});

const isBroadcast = (h: { type: string; config: Record<string, unknown> }) =>
  h.type === "broadcast" && h.config.event === "*";

beforeEach(() => {
  vi.clearAllMocks();
  __resetRealtimeChannels();
  __resetRealtimeHub();
});

describe("useLiveChannels", () => {
  it("une salle publique arrive avec sa ligne ; une salle de groupe fait relire la liste (migration 243)", async () => {
    const mock = createSupabaseMock({
      user: { id: "me" },
      results: [{ data: [salle("c1", "Hors-jeu", 0)] }, { data: [salle("c1", "Hors-jeu", 0), salle("c3", "Conseil", 2, "g1")] }],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);
    const { result } = renderHook(() => useLiveChannels("w1"));
    await waitFor(() => expect(result.current.channels?.map((c) => c.id)).toEqual(["c1"]));
    await waitFor(() => expect(mock.channelNamed("world:w1")).toBeDefined());
    const ch = mock.channelNamed("world:w1")!;

    act(() => ch.emit(isBroadcast, { event: "live_channels", payload: { op: "INSERT", record: salle("c2", "Aide", 1) } }));
    await waitFor(() => expect(result.current.channels?.map((c) => c.id)).toEqual(["c1", "c2"]));
    expect(mock.buildersFor("world_live_channels")).toHaveLength(1);

    // Sans ligne : la liste se relit, avec nos droits.
    act(() => ch.emit(isBroadcast, { event: "live_channels", payload: { op: "INSERT", id: "c3" } }));
    await waitFor(() => expect(result.current.channels?.map((c) => c.id)).toEqual(["c1", "c3"]));
    expect(mock.buildersFor("world_live_channels")).toHaveLength(2);
  });
});
