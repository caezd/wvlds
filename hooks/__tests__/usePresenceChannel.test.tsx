import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
// L'identité vient désormais du contexte CurrentUser (plus de getUser/select ici).
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

import { usePresenceChannel } from "@/hooks/usePresenceChannel";
import { createClient } from "@/lib/supabase/client";

async function setup(presence: Record<string, unknown> = {}) {
  const mock = createSupabaseMock({
    user: { id: "me" },
    results: [{ data: { username: "moi", avatar_url: null } }],
  });
  vi.mocked(createClient).mockReturnValue(mock.client as never);

  const view = renderHook(() =>
    usePresenceChannel({ chatId: "c1", persona: { id: "p1", name: "Hero" } as never }),
  );
  // Attendre l'abonnement (le canal track après SUBSCRIBED).
  await waitFor(() => {
    const ch = mock.channelNamed("chat:c1");
    expect(ch?.track).toHaveBeenCalled();
  });
  const ch = mock.channelNamed("chat:c1")!;
  ch.presence = presence;
  return { mock, ch, ...view };
}

const isPresenceSync = (h: { type: string; config: Record<string, unknown> }) =>
  h.type === "presence" && h.config.event === "sync";
const isBroadcastTyping = (h: { type: string; config: Record<string, unknown> }) =>
  h.type === "broadcast" && h.config.event === "typing";

beforeEach(() => vi.clearAllMocks());

describe("usePresenceChannel", () => {
  it("parse l'état de présence sur l'événement sync", async () => {
    const { ch, result } = await setup({
      u2: { metas: [{ username: "bob", persona_name: "Mage" }] },
    });
    act(() => ch.emit(isPresenceSync, {}));
    await waitFor(() => expect(result.current.online.u2).toBeDefined());
    expect(result.current.online.u2.username).toBe("bob");
    expect(result.current.online.u2.persona_name).toBe("Mage");
  });

  it("construit la ligne « est en train d'écrire » sur broadcast typing, sans persona", async () => {
    const { ch, result } = await setup();
    act(() => ch.emit(isBroadcastTyping, { payload: { user_id: "u2", username: "bob" } }));
    await waitFor(() => expect(result.current.typingLine).toContain("@bob"));
    expect(result.current.typingLine).toMatch(/écrit/);
    // Sans persona (persona_name absent), pas de « avec » qui traîne devant les points de suspension.
    expect(result.current.typingLine).toBe("@bob écrit...");
  });

  it("inclut le nom du persona dans la ligne « est en train d'écrire » quand il est présent", async () => {
    const { ch, result } = await setup();
    act(() => ch.emit(isBroadcastTyping, { payload: { user_id: "u2", username: "bob", persona_name: "Mage" } }));
    await waitFor(() => expect(result.current.typingLine).toContain("@bob"));
    expect(result.current.typingLine).toBe("@bob écrit avec Mage...");
  });

  it("emitTyping est throttlé (un seul send rapproché)", async () => {
    const { ch, result } = await setup();
    act(() => {
      result.current.emitTyping();
      result.current.emitTyping();
    });
    const typingSends = ch.send.mock.calls.filter(
      ([arg]) => (arg as { event?: string }).event === "typing",
    );
    expect(typingSends).toHaveLength(1);
  });

  it("clearTyping retire un utilisateur de la liste", async () => {
    const { ch, result } = await setup();
    act(() => ch.emit(isBroadcastTyping, { payload: { user_id: "u2", username: "bob" } }));
    await waitFor(() => expect(result.current.typingLine).toContain("@bob"));
    act(() => result.current.clearTyping("u2"));
    await waitFor(() => expect(result.current.typingLine).toBe(""));
  });
});

describe("usePresenceChannel — cleanup et reconnexion", () => {
  it("untrack et supprime le canal au démontage", async () => {
    const { mock, ch, unmount } = await setup();

    unmount();

    expect(ch.untrack).toHaveBeenCalled();
    expect(mock.removeChannel).toHaveBeenCalledWith(ch);
  });

  it("recrée le canal de présence après un retour de connexion réseau", async () => {
    const { mock, ch } = await setup();

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(ch.untrack).toHaveBeenCalled();
      expect(mock.removeChannel).toHaveBeenCalledWith(ch);
    });

    const newCh = mock.lastChannel()!;
    expect(newCh).not.toBe(ch);
    expect(newCh.name).toBe("chat:c1");
    await waitFor(() => expect(newCh.track).toHaveBeenCalled());
  });
});
