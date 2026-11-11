import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { useRealtimeChatSync, CATCHUP_PAGE_SIZE } from "@/hooks/useRealtimeChatSync";
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
      // 1er `.from()` : le rattrapage lancé à la souscription (rien de neuf).
      results: [{ data: [] }, { data: { id: 5, content: "salut", author_id: "a2" } }],
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
    // registre qu'après `unsubscribe()`. Sans cette attente, `channel(topic)`
    // rend le MÊME canal et les nouveaux handlers s'ajoutent aux anciens.
    // Cf. lib/realtimeChannel.
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

  it("n'accumule pas les handlers d'une reconnexion à l'autre", async () => {
    // C'est le préjudice concret, et il est silencieux : réutiliser le canal
    // au lieu d'en ouvrir un neuf empile les bindings. Après N reconnexions,
    // chaque message entrant serait traité N fois — messages dupliqués à
    // l'écran, compteurs faussés. Aucune erreur n'apparaît pour autant.
    const { mock } = setup();
    const attendus = mock.channels[0].handlers.length;
    expect(attendus).toBeGreaterThan(0);

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });
    }

    // Un canal neuf par reconnexion, chacun avec le même jeu de handlers.
    expect(mock.channels).toHaveLength(4);
    for (const ch of mock.channels) {
      expect(ch.handlers).toHaveLength(attendus);
    }
  });
});

describe("useRealtimeChatSync — rattrapage des messages manqués", () => {
  it("relit, à la souscription, les messages postés après le dernier connu", async () => {
    const { mock, cbs } = setup({
      results: [{ data: [
        { id: 4, content: "manqué 1", author_id: "a1" },
        { id: 5, content: "manqué 2", author_id: "a2" },
      ] }],
    });
    await waitFor(() => expect(cbs.onMessageInserted).toHaveBeenCalledTimes(2));
    const requete = mock.builders[0];
    expect(requete.table).toBe("chat_messages");
    expect(requete.builder.eq).toHaveBeenCalledWith("chat_id", "c1");
    expect(requete.builder.gt).toHaveBeenCalledWith("id", 3);
    expect(requete.builder.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(cbs.onMessageInserted).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 4 }), "a1");
    expect(cbs.onMessageInserted).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 5 }), "a2");
  });

  it("n'applique pas de borne quand le salon était vide (initialLatestId null)", async () => {
    const { mock } = setup({ results: [{ data: [] }] }, { initialLatestId: null });
    await waitFor(() => expect(mock.builders).toHaveLength(1));
    expect(mock.builders[0].builder.gt).not.toHaveBeenCalled();
  });

  it("ignore ensuite l'INSERT Realtime d'un message déjà rattrapé", async () => {
    const { mock, cbs } = setup({
      results: [{ data: [{ id: 4, content: "manqué", author_id: "a1" }] }],
    });
    await waitFor(() => expect(cbs.onMessageInserted).toHaveBeenCalledTimes(1));
    await act(async () => {
      mock.channelNamed("chat-c1")!.emit(isInsert, { new: { id: 4 } });
    });
    expect(cbs.onMessageInserted).toHaveBeenCalledTimes(1);
  });

  it("enchaîne les pages tant qu'elles sont pleines", async () => {
    const pleine = Array.from({ length: CATCHUP_PAGE_SIZE }, (_, i) => ({ id: 4 + i, author_id: "a" }));
    const derniere = [{ id: 4 + CATCHUP_PAGE_SIZE, author_id: "a" }];
    const { mock, cbs } = setup({ results: [{ data: pleine }, { data: derniere }] });
    await waitFor(() => expect(cbs.onMessageInserted).toHaveBeenCalledTimes(CATCHUP_PAGE_SIZE + 1));
    // La seconde page repart du dernier id de la première.
    expect(mock.builders[1].builder.gt).toHaveBeenCalledWith("id", 3 + CATCHUP_PAGE_SIZE);
  });

  it("rattrape de nouveau après une reconnexion réseau", async () => {
    const { mock, cbs } = setup({
      results: [{ data: [] }, { data: [{ id: 9, author_id: "a3" }] }],
    });
    await waitFor(() => expect(mock.builders).toHaveLength(1));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(cbs.onMessageInserted).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }), "a3"));
  });

  it("ne livre rien en cas d'erreur de lecture", async () => {
    const { cbs, mock } = setup({ results: [{ data: null, error: { message: "boom" } }] });
    await waitFor(() => expect(mock.builders).toHaveLength(1));
    await act(async () => {});
    expect(cbs.onMessageInserted).not.toHaveBeenCalled();
  });
});

describe("useRealtimeChatSync — message déjà affiché", () => {
  it("ne relit pas un message que la vue affiche déjà (envoyé par soi)", async () => {
    const { mock, cbs } = setup({ results: [{ data: [] }] }, { isMessageKnown: (id) => id === 5 });
    await waitFor(() => expect(mock.builders).toHaveLength(1)); // rattrapage seul
    await act(async () => {
      mock.channelNamed("chat-c1")!.emit(isInsert, { new: { id: 5 } });
    });
    expect(mock.builders).toHaveLength(1);
    expect(cbs.onMessageInserted).not.toHaveBeenCalled();
  });
});

describe("useRealtimeChatSync — resynchronisation", () => {
  it("signale chaque (re)connexion du canal à la vue", async () => {
    const onSubscribed = vi.fn();
    setup({ results: [{ data: [] }, { data: [] }] }, { onSubscribed });
    expect(onSubscribed).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(onSubscribed).toHaveBeenCalledTimes(2));
  });
});
