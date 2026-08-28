import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { useRealtimeChatSync } from "@/hooks/useRealtimeChatSync";
import { createClient } from "@/lib/supabase/client";

function setup(opts: Parameters<typeof createSupabaseMock>[0] = {}, props: Partial<Parameters<typeof useRealtimeChatSync>[0]> = {}) {
  const mock = createSupabaseMock(opts);
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const cbs = {
    onMessageInserted: vi.fn(),
    onMessageUpdated: vi.fn(),
    onMessageDeleted: vi.fn(),
    onChatroomPatched: vi.fn(),
    onReactionChange: vi.fn(),
  };
  const view = renderHook(() =>
    useRealtimeChatSync({ chatId: "c1", selfId: "me", initialLatestId: 3, ...cbs, ...props }),
  );
  return { mock, cbs, unmount: view.unmount };
}

// Tous les bindings sont désormais multiplexés sur un seul canal ("chat-c1") :
// les prédicats doivent donc désambiguïser par event + table, pas seulement par event.
type Handler = { type: string; config: Record<string, unknown> };
const isInsert = (h: Handler) => h.config.event === "INSERT" && h.config.table === "chat_messages";
const isDelete = (h: Handler) => h.config.event === "DELETE" && h.config.table === "chat_messages";
const isMessageUpdate = (h: Handler) => h.config.event === "UPDATE" && h.config.table === "chat_messages";
const isChatroomUpdate = (h: Handler) => h.config.event === "UPDATE" && h.config.table === "chatrooms";
const isReaction = (h: Handler) => h.config.event === "*" && h.config.table === "chat_message_reactions";

beforeEach(() => vi.clearAllMocks());

describe("useRealtimeChatSync", () => {
  it("ignore un INSERT déjà connu (id <= initialLatestId)", async () => {
    const { mock, cbs } = setup();
    await act(async () => {
      mock.channelNamed("chat-c1")!.emit(isInsert, { new: { id: 2 } });
    });
    expect(cbs.onMessageInserted).not.toHaveBeenCalled();
  });

  it("récupère et propage un INSERT plus récent", async () => {
    const { mock, cbs } = setup({
      results: [{ data: { id: 5, content: "salut", author_id: "a2" } }],
    });
    await act(async () => {
      mock.channelNamed("chat-c1")!.emit(isInsert, { new: { id: 5 } });
    });
    await waitFor(() => expect(cbs.onMessageInserted).toHaveBeenCalled());
    expect(cbs.onMessageInserted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5 }),
      "a2",
    );
  });

  it("propage une suppression de message", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chat-c1")!.emit(isDelete, { old: { id: 7 } });
    });
    expect(cbs.onMessageDeleted).toHaveBeenCalledWith(7);
  });

  it("propage une édition de contenu", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chat-c1")!.emit(isMessageUpdate, {
        new: { id: 9, content: "édité" },
      });
    });
    expect(cbs.onMessageUpdated).toHaveBeenCalledWith(9, "édité", null);
  });

  it("propage la metadata mise à jour (ex. sms/bubbles décoché)", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chat-c1")!.emit(isMessageUpdate, {
        new: { id: 9, content: "édité", metadata: { sms: true } },
      });
    });
    expect(cbs.onMessageUpdated).toHaveBeenCalledWith(9, "édité", { sms: true });
  });

  it("propage un patch de chatroom (titre/bannière)", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chat-c1")!.emit(isChatroomUpdate, {
        new: { title: "Nouveau titre" },
      });
    });
    expect(cbs.onChatroomPatched).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nouveau titre" }),
    );
  });

  it("applique une réaction d'un autre utilisateur (delta +1)", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chat-c1")!.emit(isReaction, {
        eventType: "INSERT",
        new: { message_id: 1, emoji: "👍", user_id: "autre" },
      });
    });
    expect(cbs.onReactionChange).toHaveBeenCalledWith(1, "👍", 1);
  });

  it("ignore sa propre réaction (évite le double comptage)", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chat-c1")!.emit(isReaction, {
        eventType: "INSERT",
        new: { message_id: 1, emoji: "👍", user_id: "me" },
      });
    });
    expect(cbs.onReactionChange).not.toHaveBeenCalled();
  });

  it("ne crée qu'un seul canal Realtime pour toute la salle (INSERT/DELETE/UPDATE/réactions fusionnés)", () => {
    const { mock } = setup();
    expect(mock.channels).toHaveLength(1);
    expect(mock.channels[0].name).toBe("chat-c1");
  });

  it("ajoute les bindings votes/personas sur le même canal quand les callbacks optionnels sont fournis", () => {
    const { mock } = setup({}, {
      onVoteChange: vi.fn(),
      onPersonaUpdated: vi.fn(),
    });
    // Toujours un seul canal, avec deux bindings supplémentaires.
    expect(mock.channels).toHaveLength(1);
    const events = mock.channels[0].handlers.map(h => `${h.config.event}:${h.config.table}`);
    expect(events).toContain("*:chat_choice_votes");
    expect(events).toContain("UPDATE:personas");
  });
});

describe("useRealtimeChatSync — cleanup et reconnexion", () => {
  it("supprime le canal Realtime au démontage", () => {
    const { mock, unmount } = setup();
    const created = [...mock.channels];
    expect(created).toHaveLength(1);

    unmount();

    expect(mock.removeChannel).toHaveBeenCalledWith(created[0]);
    expect(mock.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("recrée le canal après un retour de connexion réseau (reconnectEpoch)", async () => {
    const { mock } = setup();
    const before = mock.channels[0];
    expect(mock.channels).toHaveLength(1);

    // `await` indispensable : la réouverture ATTEND la fermeture précédente.
    // `removeChannel` est asynchrone dans supabase-js — le canal ne quitte le
    // registre qu'après `unsubscribe()`. Rouvrir sans attendre récupérerait le
    // canal encore souscrit, et `.on()` lèverait. Cf. lib/realtimeChannel.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    // L'ancien canal est bien fermé...
    expect(mock.removeChannel).toHaveBeenCalledWith(before);
    // ...et remplacé par une nouvelle instance de même nom, pas réutilisée.
    expect(mock.channels).toHaveLength(2);
    expect(mock.channels[1].name).toBe(before.name);
    expect(mock.channels[1]).not.toBe(before);
  });
});
