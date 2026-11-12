import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { useRealtimeChatSync, CATCHUP_PAGE_SIZE, CATCHUP_MAX_PAGES } from "@/hooks/useRealtimeChatSync";
import { emitRoomMessage } from "@/lib/roomMessageEvents";
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

// Tout passe par le canal PRIVÉ du salon (`room:c1`, migration 212) : la base y
// diffuse des avis `broadcast`, distingués par leur nom d'événement.
type Handler = { type: string; config: Record<string, unknown> };
const evenement = (nom: string) => (h: Handler) => h.type === "broadcast" && h.config.event === nom;
function diffuser(mock: ReturnType<typeof createSupabaseMock>, nom: string, payload: Record<string, unknown>) {
  mock.channelNamed("room:c1")!.emit(evenement(nom), { type: "broadcast", event: nom, payload });
}

beforeEach(() => vi.clearAllMocks());

describe("useRealtimeChatSync", () => {
  it("ignore un INSERT déjà connu (id <= initialLatestId)", async () => {
    const { mock, cbs } = setup();
    await act(async () => {
      diffuser(mock, "message", { op: "INSERT", id: 2 });
    });
    expect(cbs.onMessageInserted).not.toHaveBeenCalled();
  });

  it("récupère et propage un INSERT plus récent", async () => {
    const { mock, cbs } = setup({
      // 1er `.from()` : le rattrapage lancé à la souscription (rien de neuf).
      results: [{ data: [] }, { data: { id: 5, content: "salut", author_id: "a2" } }],
    });
    await act(async () => {
      diffuser(mock, "message", { op: "INSERT", id: 5 });
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
      diffuser(mock, "message", { op: "DELETE", id: 7 });
    });
    expect(cbs.onMessageDeleted).toHaveBeenCalledWith(7);
  });

  it("propage une édition : contenu et metadata relus (l'avis ne porte que l'id)", async () => {
    const { mock, cbs } = setup({
      results: [{ data: [] }, { data: { id: 9, content: "édité", metadata: { sms: true } } }],
    });
    await act(async () => {
      diffuser(mock, "message", { op: "UPDATE", id: 9 });
    });
    await waitFor(() => expect(cbs.onMessageUpdated).toHaveBeenCalledWith(9, "édité", { sms: true }));
  });

  it("propage un patch de chatroom (titre/bannière)", async () => {
    const { mock, cbs } = setup();
    act(() => {
      diffuser(mock, "chatroom", { title: "Nouveau titre" });
    });
    expect(cbs.onChatroomPatched).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nouveau titre" }),
    );
  });

  it("applique une réaction d'un autre utilisateur (delta +1, puis -1)", async () => {
    const { mock, cbs } = setup();
    act(() => {
      diffuser(mock, "reaction", { op: "INSERT", message_id: 1, emoji: "👍", user_id: "autre" });
      diffuser(mock, "reaction", { op: "DELETE", message_id: 1, emoji: "👍", user_id: "autre" });
    });
    expect(cbs.onReactionChange).toHaveBeenNthCalledWith(1, 1, "👍", 1);
    expect(cbs.onReactionChange).toHaveBeenNthCalledWith(2, 1, "👍", -1);
  });

  it("ignore sa propre réaction (évite le double comptage)", async () => {
    const { mock, cbs } = setup();
    act(() => {
      diffuser(mock, "reaction", { op: "INSERT", message_id: 1, emoji: "👍", user_id: "me" });
    });
    expect(cbs.onReactionChange).not.toHaveBeenCalled();
  });

  it("relaie les votes des autres (ancien → nouveau choix) et l'avatar d'une persona", () => {
    const onVoteChange = vi.fn();
    const onPersonaUpdated = vi.fn();
    const { mock } = setup({}, { onVoteChange, onPersonaUpdated });
    act(() => {
      diffuser(mock, "vote", { op: "UPDATE", message_id: 3, user_id: "autre", old_option_id: "a", new_option_id: "b" });
      diffuser(mock, "vote", { op: "INSERT", message_id: 3, user_id: "me", old_option_id: null, new_option_id: "a" });
      diffuser(mock, "persona", { id: "p1", avatar_url: "x.png" });
    });
    expect(onVoteChange).toHaveBeenCalledTimes(1);
    expect(onVoteChange).toHaveBeenCalledWith(3, "a", "b");
    expect(onPersonaUpdated).toHaveBeenCalledWith("p1", "x.png");
  });

  it("un seul canal, PRIVÉ, pour toute la salle — sans aucun postgres_changes", () => {
    const { mock } = setup({}, { onVoteChange: vi.fn(), onPersonaUpdated: vi.fn() });
    expect(mock.channels).toHaveLength(1);
    expect(mock.channels[0].name).toBe("room:c1");
    expect(mock.channel).toHaveBeenCalledWith("room:c1", { config: { private: true } });
    expect(mock.channels[0].handlers.some((h) => h.type === "postgres_changes")).toBe(false);
  });

  it("reçoit les notes privées de CE salon, relayées depuis le canal personnel", async () => {
    const { mock, cbs } = setup({
      results: [{ data: [] }, { data: { id: 8, content: "chut", author_id: "a3" } }],
    });
    await waitFor(() => expect(mock.builders).toHaveLength(1));
    await act(async () => {
      emitRoomMessage({ op: "INSERT", id: 8, chat_id: "autre-salon", author_id: "a3" });
      emitRoomMessage({ op: "INSERT", id: 8, chat_id: "c1", author_id: "a3" });
    });
    await waitFor(() => expect(cbs.onMessageInserted).toHaveBeenCalledTimes(1));
    expect(cbs.onMessageInserted).toHaveBeenCalledWith(expect.objectContaining({ id: 8 }), "a3");
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
      diffuser(mock, "message", { op: "INSERT", id: 4 });
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
      diffuser(mock, "message", { op: "INSERT", id: 5 });
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

describe("useRealtimeChatSync — ordre de passage", () => {
  it("relaie les changements d'ordre du salon", async () => {
    const onTurnChanged = vi.fn();
    const { mock } = setup({ results: [{ data: [] }] }, { onTurnChanged });
    act(() => {
      diffuser(mock, "turn", { chat_id: "c1", enabled: true, order_user_ids: ["a"], current_index: 0 });
    });
    expect(onTurnChanged).toHaveBeenCalledWith(expect.objectContaining({ chat_id: "c1", current_index: 0 }));
  });
});

describe("useRealtimeChatSync — trou trop grand pour le rattrapage", () => {
  const pagesPleines = () =>
    Array.from({ length: CATCHUP_MAX_PAGES }, (_, p) => ({
      data: Array.from({ length: CATCHUP_PAGE_SIZE }, (_, i) => ({ id: 4 + p * CATCHUP_PAGE_SIZE + i, author_id: "a" })),
    }));

  it("au-delà de la limite, la vue recharge la dernière page et le hook repart de là", async () => {
    const onCatchUpGap = vi.fn(async () => 10_000);
    const { mock, cbs } = setup({ results: [...pagesPleines(), { data: { id: 9_000 } }] }, { onCatchUpGap });

    await waitFor(() => expect(onCatchUpGap).toHaveBeenCalledTimes(1));
    expect(mock.builders.filter((b) => b.table === "chat_messages")).toHaveLength(CATCHUP_MAX_PAGES);

    // Un message plus ancien que la page rechargée n'est plus relu.
    const avant = cbs.onMessageInserted.mock.calls.length;
    await act(async () => {
      diffuser(mock, "message", { op: "INSERT", id: 9_000 });
    });
    expect(cbs.onMessageInserted.mock.calls.length).toBe(avant);
  });

  it("sans relais fourni, le rattrapage continue au-delà de la limite", async () => {
    const { mock } = setup({ results: [...pagesPleines(), { data: [{ id: 99_999, author_id: "a" }] }] });
    await waitFor(() =>
      expect(mock.builders.filter((b) => b.table === "chat_messages")).toHaveLength(CATCHUP_MAX_PAGES + 1),
    );
  });
});
