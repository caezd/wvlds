import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabaseMock";
import DmsProvider, { useDms } from "@/components/providers/DmsProvider";
import { FeatureFlagsProvider } from "@/components/providers/FeatureFlagsProvider";
import { DEFAULT_FLAGS } from "@/lib/featureFlags";

// jsdom fournit un localStorage partiel (pas de .clear()) — DmsProvider s'en sert
// pour persister la dernière conversation ouverte et les épingles.
const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
    getItem: (key: string) => _store[key] ?? null,
    setItem: (key: string, value: string) => { _store[key] = value; },
    removeItem: (key: string) => { delete _store[key]; },
    clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

// Comme NotificationsProvider, le bootstrap passe par get_app_shell() (voir
// lib/appShell.ts). openConversation() appelle en plus find_or_create_dm,
// count_common_worlds et get_dm_conversations.
function mockRpc(mock: SupabaseMock, opts: { convId?: string } = {}) {
    const { convId = "conv1" } = opts;
    mock.client.rpc.mockImplementation((name: string) => {
        if (name === "get_app_shell") {
            return Promise.resolve({
                data: {
                    world_ids: [],
                    room_unreads: [],
                    notification_preferences: [],
                    notifications: [],
                    dm_conversations: [],
                },
                error: null,
            });
        }
        if (name === "find_or_create_dm") {
            return Promise.resolve({ data: convId, error: null });
        }
        if (name === "count_common_worlds") {
            return Promise.resolve({ data: 0, error: null });
        }
        if (name === "get_dm_conversations") {
            return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
    });
}

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({
    useCurrentUser: vi.fn(() => ({ userId: "u1" })),
}));

function Consumer() {
    const {
        activeConvId, conversations, messages, openConversation, blockedUserIds, blockUser, unblockUser,
        hasMoreConversations, loadMoreConversations, otherTyping, emitTyping,
        editMessage, deleteMessage,
    } = useDms();
    const conv1Unread = conversations.find(c => c.id === "conv1")?.unread_count;
    const msg501 = messages.find(m => m.id === 501);
    return (
        <>
            <span data-testid="active-conv">{activeConvId ?? ""}</span>
            <span data-testid="blocked">{blockedUserIds.join(",")}</span>
            <span data-testid="conv1-unread">{conv1Unread ?? ""}</span>
            <span data-testid="conv-count">{conversations.length}</span>
            <span data-testid="has-more-convs">{hasMoreConversations ? "yes" : "no"}</span>
            <span data-testid="other-typing">{otherTyping ? "yes" : "no"}</span>
            <span data-testid="msg-count">{messages.length}</span>
            <span data-testid="msg501-content">{msg501?.content ?? ""}</span>
            <button data-testid="open" onClick={() => void openConversation("other1")}>
                ouvrir
            </button>
            <button data-testid="block" onClick={() => void blockUser("other1")}>
                bloquer
            </button>
            <button data-testid="unblock" onClick={() => void unblockUser("other1")}>
                débloquer
            </button>
            <button data-testid="load-more-convs" onClick={() => void loadMoreConversations()}>
                plus de conversations
            </button>
            <button data-testid="emit-typing" onClick={() => emitTyping()}>
                écrire
            </button>
            <button data-testid="edit-msg501" onClick={() => void editMessage(501, "modifié")}>
                modifier
            </button>
            <button data-testid="delete-msg501" onClick={() => void deleteMessage(501)}>
                supprimer
            </button>
        </>
    );
}

// `.from()` est consommé dans l'ordre : le select de user_blocks (bootstrap),
// puis le select historique de messages (openConversation), puis l'upsert de
// markConvRead.
function setup() {
    const mock = createSupabaseMock({
        user: { id: "u1" },
        results: [{ data: [] }, { data: [] }, { data: null }],
    });
    mockRpc(mock);
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const view = render(
        <FeatureFlagsProvider flags={{ ...DEFAULT_FLAGS, direct_messages: true }}>
            <DmsProvider>
                <Consumer />
            </DmsProvider>
        </FeatureFlagsProvider>,
    );

    return { mock, ...view };
}

beforeEach(() => vi.clearAllMocks());

describe("DmsProvider — cleanup et reconnexion (canal des conversations)", () => {
    it("supprime le canal des conversations au démontage", async () => {
        const { mock, unmount } = setup();

        await waitFor(() => expect(mock.channelNamed("dm:u1:conversations")).toBeDefined());
        const ch = mock.channelNamed("dm:u1:conversations")!;

        unmount();

        expect(mock.removeChannel).toHaveBeenCalledWith(ch);
    });

    it("recrée le canal des conversations après un retour de connexion réseau", async () => {
        const { mock } = setup();

        await waitFor(() => expect(mock.channelNamed("dm:u1:conversations")).toBeDefined());
        const oldCh = mock.channelNamed("dm:u1:conversations")!;

        await act(async () => {
            window.dispatchEvent(new Event("online"));
        });

        await waitFor(() => expect(mock.removeChannel).toHaveBeenCalledWith(oldCh));
        const named = mock.channels.filter(c => c.name === "dm:u1:conversations");
        expect(named).toHaveLength(2);
        expect(named[1]).not.toBe(oldCh);
    });
});

describe("DmsProvider — cleanup et reconnexion (canal des messages de la conversation active)", () => {
    it("supprime le canal de messages au démontage", async () => {
        const { mock, unmount } = setup();

        await act(async () => {
            screen.getByTestId("open").click();
        });
        await waitFor(() => expect(mock.channelNamed("dm:conv1:messages")).toBeDefined());
        const ch = mock.channelNamed("dm:conv1:messages")!;

        unmount();

        expect(mock.removeChannel).toHaveBeenCalledWith(ch);
    });

    it("recrée le canal de messages après un retour de connexion réseau", async () => {
        const { mock } = setup();

        await act(async () => {
            screen.getByTestId("open").click();
        });
        await waitFor(() => expect(mock.channelNamed("dm:conv1:messages")).toBeDefined());
        const oldCh = mock.channelNamed("dm:conv1:messages")!;

        await act(async () => {
            window.dispatchEvent(new Event("online"));
        });

        await waitFor(() => expect(mock.removeChannel).toHaveBeenCalledWith(oldCh));
        const named = mock.channels.filter(c => c.name === "dm:conv1:messages");
        expect(named).toHaveLength(2);
        expect(named[1]).not.toBe(oldCh);
    });
});

describe("DmsProvider — blocage d'utilisateur", () => {
    it("charge la liste des utilisateurs bloqués au bootstrap", async () => {
        const mock = createSupabaseMock({
            user: { id: "u1" },
            results: [{ data: [{ blocked_id: "other1" }] }, { data: [] }, { data: null }],
        });
        mockRpc(mock);
        vi.mocked(createClient).mockReturnValue(mock.client as never);

        render(
            <FeatureFlagsProvider flags={{ ...DEFAULT_FLAGS, direct_messages: true }}>
                <DmsProvider>
                    <Consumer />
                </DmsProvider>
            </FeatureFlagsProvider>,
        );

        await waitFor(() => expect(screen.getByTestId("blocked").textContent).toBe("other1"));
    });

    it("ajoute l'utilisateur à la liste après blockUser", async () => {
        setup();
        await waitFor(() => expect(screen.getByTestId("blocked").textContent).toBe(""));

        await act(async () => {
            screen.getByTestId("block").click();
        });

        await waitFor(() => expect(screen.getByTestId("blocked").textContent).toBe("other1"));
    });

    it("retire l'utilisateur de la liste après unblockUser", async () => {
        setup();
        // Attend la fin du chargement initial (liste vide) avant de bloquer :
        // sinon la résolution tardive du bootstrap écraserait l'ajout optimiste.
        await waitFor(() => expect(screen.getByTestId("blocked").textContent).toBe(""));

        await act(async () => {
            screen.getByTestId("block").click();
        });
        await waitFor(() => expect(screen.getByTestId("blocked").textContent).toBe("other1"));

        await act(async () => {
            screen.getByTestId("unblock").click();
        });

        await waitFor(() => expect(screen.getByTestId("blocked").textContent).toBe(""));
    });
});

const CONV1_BASE = {
    id: "conv1",
    other_user_id: "other1",
    other_username: "Foo",
    other_avatar_url: null,
    last_message_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    last_message_content: "salut",
    last_message_author_id: "other1",
    unread_count: 2,
};

// Bootstrap avec une conversation déjà connue (conv1, 2 non-lus) : sert à
// vérifier que le canal « conversations » met à jour l'état localement au
// lieu de systématiquement réinterroger get_dm_conversations().
function setupWithConv1() {
    const mock = createSupabaseMock({
        user: { id: "u1" },
        results: [{ data: [] }, { data: [] }, { data: null }],
    });
    mock.client.rpc.mockImplementation((name: string) => {
        if (name === "get_app_shell") {
            return Promise.resolve({
                data: {
                    world_ids: [],
                    room_unreads: [],
                    notification_preferences: [],
                    notifications: [],
                    dm_conversations: [CONV1_BASE],
                },
                error: null,
            });
        }
        if (name === "find_or_create_dm") return Promise.resolve({ data: "conv1", error: null });
        if (name === "count_common_worlds") return Promise.resolve({ data: 0, error: null });
        if (name === "get_dm_conversations") {
            // Le serveur reflète déjà le marquage comme lu (utilisé par le test
            // qui ouvre la conversation).
            return Promise.resolve({ data: [{ ...CONV1_BASE, unread_count: 0 }], error: null });
        }
        return Promise.resolve({ data: null, error: null });
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(
        <FeatureFlagsProvider flags={{ ...DEFAULT_FLAGS, direct_messages: true }}>
            <DmsProvider>
                <Consumer />
            </DmsProvider>
        </FeatureFlagsProvider>,
    );

    return mock;
}

function emitDmInsert(mock: SupabaseMock, msg: { id: number; conversation_id: string; author_id: string; content: string; created_at: string }) {
    const convCh = mock.channelNamed("dm:u1:conversations")!;
    convCh.emit(
        (h) => h.type === "postgres_changes" && (h.config as { event?: string }).event === "INSERT",
        { new: msg },
    );
}

describe("DmsProvider — canal des conversations (mise à jour incrémentale)", () => {
    it("incrémente les non-lus localement pour un message reçu dans une conversation connue inactive, sans réinterroger get_dm_conversations", async () => {
        const mock = setupWithConv1();

        await waitFor(() => expect(screen.getByTestId("conv1-unread").textContent).toBe("2"));
        mock.rpc.mockClear();

        await act(async () => {
            emitDmInsert(mock, { id: 999, conversation_id: "conv1", author_id: "other1", content: "hey", created_at: "2026-01-02T00:00:00.000Z" });
        });

        await waitFor(() => expect(screen.getByTestId("conv1-unread").textContent).toBe("3"));
        expect(mock.rpc.mock.calls.some(([name]) => name === "get_dm_conversations")).toBe(false);
    });

    it("réinterroge get_dm_conversations si le message concerne une conversation encore inconnue", async () => {
        const mock = setupWithConv1();

        await waitFor(() => expect(screen.getByTestId("conv1-unread").textContent).toBe("2"));
        mock.rpc.mockClear();

        await act(async () => {
            emitDmInsert(mock, { id: 1001, conversation_id: "conv-new", author_id: "other2", content: "salut", created_at: "2026-01-02T00:00:00.000Z" });
        });

        await waitFor(() => expect(mock.rpc.mock.calls.some(([name]) => name === "get_dm_conversations")).toBe(true));
    });

    it("ne recrédite pas les non-lus si le message reçu concerne la conversation active", async () => {
        const mock = setupWithConv1();

        await act(async () => {
            screen.getByTestId("open").click();
        });
        await waitFor(() => expect(screen.getByTestId("conv1-unread").textContent).toBe("0"));

        await act(async () => {
            emitDmInsert(mock, { id: 1002, conversation_id: "conv1", author_id: "other1", content: "hey", created_at: "2026-01-02T00:00:00.000Z" });
        });

        expect(screen.getByTestId("conv1-unread").textContent).toBe("0");
    });
});

// 20 conversations avec des dates décroissantes (conv0 = la plus récente) —
// une page pleine pour tester le déclenchement de la pagination.
function makeConv(i: number) {
    const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, 0) - i * 60_000).toISOString();
    return {
        id: `conv${i}`,
        other_user_id: `other${i}`,
        other_username: `user${i}`,
        other_avatar_url: null,
        last_message_at: ts,
        created_at: ts,
        last_message_content: "salut",
        last_message_author_id: `other${i}`,
        unread_count: 0,
    };
}
const FIRST_PAGE_CONVS = Array.from({ length: 20 }, (_, i) => makeConv(i));
const SECOND_PAGE_CONVS = Array.from({ length: 5 }, (_, i) => makeConv(20 + i));

function setupWithManyConvs() {
    const mock = createSupabaseMock({
        user: { id: "u1" },
        results: [{ data: [] }],
    });
    mock.client.rpc.mockImplementation((name: string, args?: Record<string, unknown>) => {
        if (name === "get_app_shell") {
            return Promise.resolve({
                data: {
                    world_ids: [],
                    room_unreads: [],
                    notification_preferences: [],
                    notifications: [],
                    dm_conversations: FIRST_PAGE_CONVS,
                },
                error: null,
            });
        }
        if (name === "get_dm_conversations") {
            // loadMoreConversations appelle avec un curseur ; le bootstrap ne
            // repasse pas par cette RPC (get_app_shell suffit).
            return Promise.resolve({ data: args?.p_cursor ? SECOND_PAGE_CONVS : [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(
        <FeatureFlagsProvider flags={{ ...DEFAULT_FLAGS, direct_messages: true }}>
            <DmsProvider>
                <Consumer />
            </DmsProvider>
        </FeatureFlagsProvider>,
    );

    return mock;
}

describe("DmsProvider — pagination de la liste de conversations", () => {
    it("expose hasMoreConversations quand le bootstrap renvoie une page pleine", async () => {
        setupWithManyConvs();

        await waitFor(() => expect(screen.getByTestId("conv-count").textContent).toBe("20"));
        expect(screen.getByTestId("has-more-convs").textContent).toBe("yes");
    });

    it("loadMoreConversations ajoute la page suivante avec le curseur de la dernière conversation connue", async () => {
        const mock = setupWithManyConvs();
        await waitFor(() => expect(screen.getByTestId("conv-count").textContent).toBe("20"));

        await act(async () => {
            screen.getByTestId("load-more-convs").click();
        });

        await waitFor(() => expect(screen.getByTestId("conv-count").textContent).toBe("25"));
        // 5 < DM_CONVERSATIONS_PAGE (20) : plus de page suivante.
        expect(screen.getByTestId("has-more-convs").textContent).toBe("no");

        const call = mock.rpc.mock.calls.find(([name]) => name === "get_dm_conversations");
        expect(call?.[1]).toMatchObject({ p_cursor: FIRST_PAGE_CONVS[19]!.last_message_at });
    });
});

describe("DmsProvider — indicateur « en train d'écrire »", () => {
    it("passe otherTyping à true à la réception d'un broadcast typing sur la conversation active", async () => {
        const { mock } = setup();

        await act(async () => {
            screen.getByTestId("open").click();
        });
        await waitFor(() => expect(mock.channelNamed("dm:conv1:messages")).toBeDefined());

        const msgCh = mock.channelNamed("dm:conv1:messages")!;
        act(() => {
            msgCh.emit((h) => h.type === "broadcast" && (h.config as { event?: string }).event === "typing", {});
        });

        await waitFor(() => expect(screen.getByTestId("other-typing").textContent).toBe("yes"));
    });

    it("repasse otherTyping à false après le délai d'expiration", async () => {
        const { mock } = setup();

        await act(async () => {
            screen.getByTestId("open").click();
        });
        await waitFor(() => expect(mock.channelNamed("dm:conv1:messages")).toBeDefined());
        const msgCh = mock.channelNamed("dm:conv1:messages")!;

        // Le setTimeout doit être programmé APRÈS l'activation des fake timers
        // pour qu'advanceTimersByTime puisse le déclencher (un setTimeout réel
        // déjà en vol n'est pas affecté par l'horloge simulée).
        vi.useFakeTimers();
        try {
            act(() => {
                msgCh.emit((h) => h.type === "broadcast" && (h.config as { event?: string }).event === "typing", {});
            });
            expect(screen.getByTestId("other-typing").textContent).toBe("yes");

            act(() => {
                vi.advanceTimersByTime(4000);
            });
            expect(screen.getByTestId("other-typing").textContent).toBe("no");
        } finally {
            vi.useRealTimers();
        }
    });

    it("throttle emitTyping : deux appels rapprochés n'envoient qu'un seul broadcast", async () => {
        const { mock } = setup();

        await act(async () => {
            screen.getByTestId("open").click();
        });
        await waitFor(() => expect(mock.channelNamed("dm:conv1:messages")).toBeDefined());
        const msgCh = mock.channelNamed("dm:conv1:messages")!;

        await act(async () => {
            screen.getByTestId("emit-typing").click();
            screen.getByTestId("emit-typing").click();
        });

        const typingSends = msgCh.send.mock.calls.filter(
            ([payload]) => (payload as { event?: string }).event === "typing",
        );
        expect(typingSends).toHaveLength(1);
    });
});

const MSG1 = {
    id: 501,
    conversation_id: "conv1",
    author_id: "other1",
    content: "Bonjour",
    created_at: "2026-01-01T00:00:00.000Z",
};

// `.from()` : user_blocks (bootstrap), messages (openConversation),
// dm_reads upsert (markConvRead), puis les résultats fournis pour les
// actions déclenchées par le test (édition/suppression).
function setupWithMessage(extraResults: { data?: unknown; error?: unknown }[] = []) {
    const mock = createSupabaseMock({
        user: { id: "u1" },
        results: [{ data: [] }, { data: [MSG1] }, { data: null }, ...extraResults],
    });
    mockRpc(mock);
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(
        <FeatureFlagsProvider flags={{ ...DEFAULT_FLAGS, direct_messages: true }}>
            <DmsProvider>
                <Consumer />
            </DmsProvider>
        </FeatureFlagsProvider>,
    );

    return mock;
}

describe("DmsProvider — édition et suppression de message", () => {
    it("editMessage met à jour le contenu localement via la réponse serveur", async () => {
        setupWithMessage([{ data: { ...MSG1, content: "modifié" } }]);

        await act(async () => {
            screen.getByTestId("open").click();
        });
        await waitFor(() => expect(screen.getByTestId("msg501-content").textContent).toBe("Bonjour"));

        await act(async () => {
            screen.getByTestId("edit-msg501").click();
        });

        await waitFor(() => expect(screen.getByTestId("msg501-content").textContent).toBe("modifié"));
    });

    it("deleteMessage retire le message localement", async () => {
        setupWithMessage([{ data: null, error: null }]);

        await act(async () => {
            screen.getByTestId("open").click();
        });
        await waitFor(() => expect(screen.getByTestId("msg-count").textContent).toBe("1"));

        await act(async () => {
            screen.getByTestId("delete-msg501").click();
        });

        await waitFor(() => expect(screen.getByTestId("msg-count").textContent).toBe("0"));
    });

    it("reflète en temps réel une édition reçue sur la conversation active", async () => {
        const mock = setupWithMessage();

        await act(async () => {
            screen.getByTestId("open").click();
        });
        await waitFor(() => expect(mock.channelNamed("dm:conv1:messages")).toBeDefined());
        const msgCh = mock.channelNamed("dm:conv1:messages")!;

        act(() => {
            msgCh.emit(
                (h) => h.type === "postgres_changes" && (h.config as { event?: string }).event === "UPDATE",
                { new: { ...MSG1, content: "édité par l'autre" } },
            );
        });

        await waitFor(() => expect(screen.getByTestId("msg501-content").textContent).toBe("édité par l'autre"));
    });

    it("retire en temps réel un message supprimé par l'autre participant", async () => {
        const mock = setupWithMessage();

        await act(async () => {
            screen.getByTestId("open").click();
        });
        await waitFor(() => expect(screen.getByTestId("msg-count").textContent).toBe("1"));
        const msgCh = mock.channelNamed("dm:conv1:messages")!;

        act(() => {
            msgCh.emit(
                (h) => h.type === "postgres_changes" && (h.config as { event?: string }).event === "DELETE",
                { old: { id: 501 } },
            );
        });

        await waitFor(() => expect(screen.getByTestId("msg-count").textContent).toBe("0"));
    });
});
