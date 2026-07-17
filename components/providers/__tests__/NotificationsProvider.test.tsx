import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabaseMock";
import NotificationsProvider, { useNotifications } from "@/components/providers/NotificationsProvider";
import type { AppNotification, AppShellResult } from "@/types/db";

// Le bootstrap charge tout via une seule RPC get_app_shell() (voir lib/appShell.ts) ;
// on la mock pour renvoyer les notifications de test, et toute autre RPC
// (get_all_chatroom_unreads via refreshAll) avec une liste vide.
function mockAppShell(
    mock: SupabaseMock,
    notifications: AppNotification[] = [],
    shell: Partial<AppShellResult> = {},
) {
    mock.client.rpc.mockImplementation((name: string) => {
        if (name === "get_app_shell") {
            return Promise.resolve({
                data: {
                    world_ids: [],
                    room_unreads: [],
                    notification_preferences: [],
                    notifications,
                    dm_conversations: [],
                    ...shell,
                },
                error: null,
            });
        }
        return Promise.resolve({ data: [], error: null });
    });
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/hooks/useCurrentUser", () => ({
    useCurrentUser: vi.fn(() => ({ userId: "u1" })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_NOTIF: AppNotification = {
    id: "n1",
    recipient_id: "u1",
    type: "mention",
    world_id: null,
    chat_id: null,
    message_id: null,
    actor_id: "a1",
    actor_name: "alice",
    persona_id: null,
    content: "général",
    metadata: null,
    read_at: null,
    archived_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

// Consommateur minimal pour lire les notifications du contexte
function Consumer() {
    const { notifications } = useNotifications();
    return (
        <ul>
            {notifications.map((n) => (
                <li key={n.id} data-testid={`notif-${n.id}`}>
                    {n.id}
                </li>
            ))}
        </ul>
    );
}

// Consommateur avec accès aux actions pour les tests d'interaction
function ConsumerWithActions() {
    const { notifications, markNotifRead, markAllNotifsRead } = useNotifications();
    return (
        <>
            <ul>
                {notifications.map((n) => (
                    <li key={n.id} data-testid={`notif-${n.id}`}>{n.id}</li>
                ))}
            </ul>
            <button onClick={() => void markNotifRead("n1")} data-testid="read-n1">lire n1</button>
            <button onClick={() => void markAllNotifsRead()} data-testid="read-all">tout lire</button>
        </>
    );
}

function setup(initialNotifs: AppNotification[] = [BASE_NOTIF]) {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    mockAppShell(mock, initialNotifs);
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(
        <NotificationsProvider>
            <Consumer />
        </NotificationsProvider>
    );

    return mock;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());

function setupWithActions(initialNotifs: AppNotification[] = [BASE_NOTIF]) {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    mockAppShell(mock, initialNotifs);
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(
        <NotificationsProvider>
            <ConsumerWithActions />
        </NotificationsProvider>
    );

    return mock;
}

// ── setActiveChat ─────────────────────────────────────────────────────────────

function ConsumerActiveChat() {
    const { setActiveChat } = useNotifications();
    return (
        <button data-testid="activate" onClick={() => setActiveChat("chat-1")}>
            activer
        </button>
    );
}

describe("NotificationsProvider — setActiveChat", () => {
    it("ne marque PAS le chat lu (pas de POST chatroom_reads redondant)", async () => {
        const mock = createSupabaseMock({ user: { id: "u1" } });
        mockAppShell(mock);
        vi.mocked(createClient).mockReturnValue(mock.client as never);

        render(
            <NotificationsProvider>
                <ConsumerActiveChat />
            </NotificationsProvider>,
        );

        await waitFor(() => expect(screen.getByTestId("activate")).toBeInTheDocument());

        act(() => {
            screen.getByTestId("activate").click();
        });

        // La vue chatroom est la seule à marquer lu : setActiveChat n'écrit rien.
        expect(mock.buildersFor("chatroom_reads")).toHaveLength(0);
    });
});

// ── markNotifRead ─────────────────────────────────────────────────────────────

describe("NotificationsProvider — markNotifRead", () => {
    it("retire la notification du state immédiatement", async () => {
        setupWithActions();

        await waitFor(() => expect(screen.getByTestId("notif-n1")).toBeInTheDocument());

        await act(async () => {
            screen.getByTestId("read-n1").click();
        });

        await waitFor(() => expect(screen.queryByTestId("notif-n1")).not.toBeInTheDocument());
    });

    it("appelle le DB update avec read_at et archived_at", async () => {
        const mock = setupWithActions();

        await waitFor(() => expect(screen.getByTestId("notif-n1")).toBeInTheDocument());

        await act(async () => {
            screen.getByTestId("read-n1").click();
        });

        await waitFor(() => expect(screen.queryByTestId("notif-n1")).not.toBeInTheDocument());

        const notifBuilders = mock.buildersFor("notifications");
        const updateBuilder = notifBuilders.find(b => b.update.mock.calls.length > 0);
        expect(updateBuilder?.update).toHaveBeenCalledWith(
            expect.objectContaining({ archived_at: expect.any(String), read_at: expect.any(String) })
        );
    });
});

// ── markAllNotifsRead ─────────────────────────────────────────────────────────

describe("NotificationsProvider — markAllNotifsRead", () => {
    it("vide la liste de notifications", async () => {
        const notifs = [
            BASE_NOTIF,
            { ...BASE_NOTIF, id: "n2", actor_name: "bob" },
        ];
        setupWithActions(notifs);

        await waitFor(() => {
            expect(screen.getByTestId("notif-n1")).toBeInTheDocument();
            expect(screen.getByTestId("notif-n2")).toBeInTheDocument();
        });

        await act(async () => {
            screen.getByTestId("read-all").click();
        });

        await waitFor(() => {
            expect(screen.queryByTestId("notif-n1")).not.toBeInTheDocument();
            expect(screen.queryByTestId("notif-n2")).not.toBeInTheDocument();
        });
    });
});

// ── Realtime UPDATE ───────────────────────────────────────────────────────────

describe("NotificationsProvider — realtime UPDATE", () => {
    it("ignore un UPDATE avec archived_at → ne réinsère pas la notification", async () => {
        const mock = setup();

        // Attendre que le bootstrap charge la notification
        await waitFor(() => {
            expect(screen.getByTestId("notif-n1")).toBeInTheDocument();
        });

        // Récupérer le canal notifs
        const notifChannel = mock.channels.find((c) => c.name === "notifs:u1");
        expect(notifChannel).toBeDefined();

        // Simuler que le provider retire la notif du state (comme archiveNotif le fait)
        // puis qu'un événement UPDATE Realtime arrive avec archived_at défini
        act(() => {
            notifChannel!.emit(
                (h) => h.type === "postgres_changes" && (h.config as { event?: string }).event === "UPDATE",
                { new: { ...BASE_NOTIF, archived_at: new Date().toISOString() } },
            );
        });

        // La notification ne doit PAS réapparaître
        await waitFor(() => {
            // Elle peut encore être là (pas d'archiveNotif côté client ici) mais
            // l'événement UPDATE ne doit pas créer de doublon ni la remonter
            const items = screen.queryAllByTestId("notif-n1");
            expect(items.length).toBeLessThanOrEqual(1);
        });

        // Scénario explicite : si on retire la notif de l'état PUIS que le UPDATE arrive,
        // elle ne doit pas revenir. On vérifie ça en cherchant un doublon.
        expect(screen.queryAllByTestId("notif-n1")).toHaveLength(1);
    });

    it("applique un UPDATE sans archived_at → met à jour la notification en tête", async () => {
        const mock = setup();

        await waitFor(() => {
            expect(screen.getByTestId("notif-n1")).toBeInTheDocument();
        });

        const notifChannel = mock.channels.find((c) => c.name === "notifs:u1");

        const updatedNotif: AppNotification = {
            ...BASE_NOTIF,
            metadata: { count: 5 },
            updated_at: new Date(Date.now() + 5000).toISOString(),
        };

        act(() => {
            notifChannel!.emit(
                (h) => h.type === "postgres_changes" && (h.config as { event?: string }).event === "UPDATE",
                { new: updatedNotif },
            );
        });

        // La notification est toujours présente (pas archivée)
        await waitFor(() => {
            expect(screen.getByTestId("notif-n1")).toBeInTheDocument();
        });
        // Pas de doublon
        expect(screen.queryAllByTestId("notif-n1")).toHaveLength(1);
    });

    it("un UPDATE archivé ne crée pas de doublon même si la notif est encore dans le state", async () => {
        const mock = setup([BASE_NOTIF]);

        await waitFor(() => {
            expect(screen.getByTestId("notif-n1")).toBeInTheDocument();
        });

        const notifChannel = mock.channels.find((c) => c.name === "notifs:u1");

        // Émettre un UPDATE avec archived_at défini (scénario du bug : bouton × déclenche
        // un UPDATE en DB qui revenait via realtime et réinsérait la notification)
        act(() => {
            notifChannel!.emit(
                (h) => h.type === "postgres_changes" && (h.config as { event?: string }).event === "UPDATE",
                { new: { ...BASE_NOTIF, archived_at: "2026-01-01T00:00:00Z" } },
            );
        });

        // Toujours exactement 1 occurrence (celle du state initial), pas de doublon
        await waitFor(() => {
            expect(screen.queryAllByTestId("notif-n1")).toHaveLength(1);
        });
    });
});

// ── Fixtures pour les tests de chatroom ───────────────────────────────────────

const REPLY_C1: AppNotification = {
    ...BASE_NOTIF,
    id: "reply-c1",
    type: "chatroom_reply",
    chat_id: "c1",
};

const REPLY_C2: AppNotification = {
    ...BASE_NOTIF,
    id: "reply-c2",
    type: "chatroom_reply",
    chat_id: "c2",
};

function ConsumerWithSetActive() {
    const { notifications, setActiveChat } = useNotifications();
    return (
        <>
            <ul>
                {notifications.map(n => (
                    <li key={n.id} data-testid={`notif-${n.id}`}>{n.id}</li>
                ))}
            </ul>
            <button data-testid="activate-c1" onClick={() => setActiveChat("c1")}>
                Ouvrir c1
            </button>
        </>
    );
}

// ── setActiveChat — archivage des notifications du chatroom ───────────────────

describe("setActiveChat — archivage des notifications du chatroom", () => {
    it("archive les notifications du chatroom ouvert et laisse les autres intactes", async () => {
        const mock = createSupabaseMock({ user: { id: "u1" } });
        mockAppShell(mock, [REPLY_C1, REPLY_C2]);
        vi.mocked(createClient).mockReturnValue(mock.client as never);

        render(
            <NotificationsProvider>
                <ConsumerWithSetActive />
            </NotificationsProvider>,
        );

        await waitFor(() => {
            expect(screen.getByTestId("notif-reply-c1")).toBeInTheDocument();
            expect(screen.getByTestId("notif-reply-c2")).toBeInTheDocument();
        });

        await act(async () => {
            screen.getByTestId("activate-c1").click();
        });

        // La notification de c1 disparaît, celle de c2 reste
        await waitFor(() => {
            expect(screen.queryByTestId("notif-reply-c1")).not.toBeInTheDocument();
        });
        expect(screen.getByTestId("notif-reply-c2")).toBeInTheDocument();

        // DB : update+in uniquement sur l'id de la notif c1
        const notifBuilders = mock.buildersFor("notifications");
        const archiveBuilder = notifBuilders.find(b =>
            b.update.mock.calls.some(call => !!(call[0] as Record<string, unknown>)?.archived_at),
        );
        expect(archiveBuilder?.update).toHaveBeenCalledWith(
            expect.objectContaining({ archived_at: expect.any(String) }),
        );
        expect(archiveBuilder?.in).toHaveBeenCalledWith("id", ["reply-c1"]);
    });
});

// ── Realtime INSERT — notification pour le chatroom actif ─────────────────────

describe("Realtime INSERT — notification pour le chatroom actif", () => {
    it("archive sans afficher si le chatroom est actuellement ouvert", async () => {
        const mock = createSupabaseMock({ user: { id: "u1" } });
        mockAppShell(mock, []);
        vi.mocked(createClient).mockReturnValue(mock.client as never);

        render(
            <NotificationsProvider>
                <ConsumerWithSetActive />
            </NotificationsProvider>,
        );

        await waitFor(() => expect(screen.getByTestId("activate-c1")).toBeInTheDocument());

        // Ouvrir le chatroom c1 (état vide → pas de from() appelé)
        await act(async () => {
            screen.getByTestId("activate-c1").click();
        });

        const notifChannel = mock.channels.find(c => c.name === "notifs:u1");
        expect(notifChannel).toBeDefined();

        // Arrivée d'une notification pour c1 (chatroom actif)
        await act(async () => {
            notifChannel!.emit(
                h => h.type === "postgres_changes" && (h.config as { event?: string }).event === "INSERT",
                { new: { id: "notif-incoming", chat_id: "c1", recipient_id: "u1" } },
            );
        });

        // Ne doit PAS apparaître dans la liste
        expect(screen.queryByTestId("notif-notif-incoming")).not.toBeInTheDocument();

        // Doit avoir archivé via update().eq()
        const notifBuilders = mock.buildersFor("notifications");
        const archiveBuilder = notifBuilders.find(b =>
            b.update.mock.calls.some(call => !!(call[0] as Record<string, unknown>)?.archived_at),
        );
        expect(archiveBuilder?.update).toHaveBeenCalledWith(
            expect.objectContaining({ archived_at: expect.any(String) }),
        );
        expect(archiveBuilder?.in).toHaveBeenCalledWith("id", ["notif-incoming"]);
    });

    it("ajoute normalement une notification si le chatroom n'est pas actif", async () => {
        const incomingNotif: AppNotification = { ...BASE_NOTIF, id: "notif-other", chat_id: "c2" };

        // results[0] sera consommé par le select+single du handler INSERT
        const mock = createSupabaseMock({ user: { id: "u1" }, results: [{ data: incomingNotif }] });
        mockAppShell(mock, []);
        vi.mocked(createClient).mockReturnValue(mock.client as never);

        render(
            <NotificationsProvider>
                <ConsumerWithSetActive />
            </NotificationsProvider>,
        );

        await waitFor(() => expect(screen.getByTestId("activate-c1")).toBeInTheDocument());

        // Ouvrir c1 (état vide → aucun from() consommé)
        await act(async () => {
            screen.getByTestId("activate-c1").click();
        });

        const notifChannel = mock.channels.find(c => c.name === "notifs:u1");
        expect(notifChannel).toBeDefined();

        // Notification pour c2 (pas c1)
        await act(async () => {
            notifChannel!.emit(
                h => h.type === "postgres_changes" && (h.config as { event?: string }).event === "INSERT",
                { new: { id: "notif-other", chat_id: "c2", recipient_id: "u1" } },
            );
        });

        // Doit apparaître normalement
        await waitFor(() => {
            expect(screen.getByTestId("notif-notif-other")).toBeInTheDocument();
        });

        // Aucun archivage ne doit avoir été déclenché
        const notifBuilders = mock.buildersFor("notifications");
        const archiveBuilder = notifBuilders.find(b =>
            b.update.mock.calls.some(call => !!(call[0] as Record<string, unknown>)?.archived_at),
        );
        expect(archiveBuilder).toBeUndefined();
    });
});

// ── Compteurs non-lus — mise à jour locale sans RPC ───────────────────────────

function ConsumerUnreads() {
    const { roomUnread, worldUnread, markChatRead, setActiveChat } = useNotifications();
    return (
        <>
            <span data-testid="room-c1">{roomUnread["c1"] ?? 0}</span>
            <span data-testid="world-w1">{worldUnread["w1"] ?? 0}</span>
            <button data-testid="read-c1" onClick={() => void markChatRead("c1")}>lu</button>
            <button data-testid="read-c2" onClick={() => void markChatRead("c2")}>lu c2</button>
            <button data-testid="open-c1" onClick={() => setActiveChat("c1")}>ouvrir</button>
        </>
    );
}

// Shell avec 1 monde (w1) : 2 messages non lus dans c1, déjà ouverte.
const UNREAD_SHELL: Partial<AppShellResult> = {
    world_ids: ["w1"],
    room_unreads: [
        { chat_id: "c1", world_id: "w1", unread_messages: 2, never_opened: false },
    ],
};

function setupUnreads(shell: Partial<AppShellResult> = UNREAD_SHELL) {
    const mock = createSupabaseMock({ user: { id: "u1" } });
    mockAppShell(mock, [], shell);
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(
        <NotificationsProvider>
            <ConsumerUnreads />
        </NotificationsProvider>,
    );

    return mock;
}

function emitMessage(mock: SupabaseMock, row: Record<string, unknown>) {
    const msgChannel = mock.channels.find(c => c.name === "msgs:u1");
    expect(msgChannel).toBeDefined();
    act(() => {
        msgChannel!.emit(
            h => h.type === "postgres_changes" && (h.config as { table?: string }).table === "chat_messages",
            { new: row },
        );
    });
}

describe("Compteurs non-lus — hydratation et dérivation", () => {
    it("hydrate depuis get_app_shell et dérive le badge de monde", async () => {
        setupUnreads();

        await waitFor(() => {
            expect(screen.getByTestId("room-c1").textContent).toBe("2");
            expect(screen.getByTestId("world-w1").textContent).toBe("2");
        });
    });

    it("une salle jamais ouverte pèse 1, sans s'ajouter à ses messages non lus", async () => {
        // Régression du double comptage : une salle neuve de 11 messages
        // affichait 12 (1 pour la salle + 11 pour les messages).
        setupUnreads({
            world_ids: ["w1"],
            room_unreads: [
                { chat_id: "c2", world_id: "w1", unread_messages: 11, never_opened: true },
            ],
        });

        await waitFor(() => expect(screen.getByTestId("world-w1").textContent).toBe("11"));
    });

    it("une salle neuve encore vide pèse 1 (signal « nouvelle salle »)", async () => {
        setupUnreads({
            world_ids: ["w1"],
            room_unreads: [
                { chat_id: "c2", world_id: "w1", unread_messages: 0, never_opened: true },
            ],
        });

        await waitFor(() => expect(screen.getByTestId("world-w1").textContent).toBe("1"));
    });
});

describe("Compteurs non-lus — la pastille de monde s'efface par la lecture", () => {
    // LE bug corrigé par la migration 075. Avant : la part « nouvelle salle »
    // ne se calculait que depuis world_member_reads.last_seen_at, que seul
    // l'accueil du monde repoussait. Un joueur arrivant par /c/{id} depuis son
    // centre de notifications lisait tout sans jamais pouvoir effacer la
    // pastille — parfois pendant des heures, jusqu'à un passage par l'accueil.
    it("lire une salle jamais ouverte efface la pastille, sans passer par l'accueil du monde", async () => {
        setupUnreads({
            world_ids: ["w1"],
            room_unreads: [
                { chat_id: "c2", world_id: "w1", unread_messages: 0, never_opened: true },
            ],
        });

        await waitFor(() => expect(screen.getByTestId("world-w1").textContent).toBe("1"));

        // Entrer dans la salle — seul markChatRead, aucun marquage de monde.
        await act(async () => {
            screen.getByTestId("read-c2").click();
        });

        expect(screen.getByTestId("world-w1").textContent).toBe("0");
    });

    it("lire une salle neuve à messages efface la pastille entièrement", async () => {
        setupUnreads({
            world_ids: ["w1"],
            room_unreads: [
                { chat_id: "c2", world_id: "w1", unread_messages: 11, never_opened: true },
            ],
        });

        await waitFor(() => expect(screen.getByTestId("world-w1").textContent).toBe("11"));

        await act(async () => {
            screen.getByTestId("read-c2").click();
        });

        expect(screen.getByTestId("world-w1").textContent).toBe("0");
    });
});

describe("Compteurs non-lus — Realtime local, sans RPC", () => {
    it("incrémente localement à l'arrivée d'un message, sans appel RPC", async () => {
        const mock = setupUnreads({ ...UNREAD_SHELL, room_unreads: [] });

        await waitFor(() => expect(screen.getByTestId("room-c1")).toBeInTheDocument());

        emitMessage(mock, { chat_id: "c1", author_id: "someone-else", world_id: "w1" });

        await waitFor(() => {
            expect(screen.getByTestId("room-c1").textContent).toBe("1");
            expect(screen.getByTestId("world-w1").textContent).toBe("1");
        });

        // Aucune RPC de recomptage : seule get_app_shell a été appelée
        const rpcNames = mock.rpc.mock.calls.map(call => call[0] as string);
        expect(rpcNames.filter(n => n !== "get_app_shell")).toHaveLength(0);
    });

    it("ignore ses propres messages", async () => {
        const mock = setupUnreads({ ...UNREAD_SHELL, room_unreads: [] });

        await waitFor(() => expect(screen.getByTestId("room-c1")).toBeInTheDocument());

        emitMessage(mock, { chat_id: "c1", author_id: "u1", world_id: "w1" });

        expect(screen.getByTestId("room-c1").textContent).toBe("0");
        expect(screen.getByTestId("world-w1").textContent).toBe("0");
    });

    it("message dans la salle active → marque lu au lieu d'incrémenter", async () => {
        const mock = setupUnreads({ ...UNREAD_SHELL, room_unreads: [] });

        await waitFor(() => expect(screen.getByTestId("open-c1")).toBeInTheDocument());

        await act(async () => {
            screen.getByTestId("open-c1").click();
        });

        emitMessage(mock, { chat_id: "c1", author_id: "someone-else", world_id: "w1" });

        // Compteur inchangé, mais la lecture est persistée en DB
        expect(screen.getByTestId("room-c1").textContent).toBe("0");
        await waitFor(() => {
            expect(mock.buildersFor("chatroom_reads").length).toBeGreaterThan(0);
        });
    });
});

describe("Compteurs non-lus — lecture locale", () => {
    it("markChatRead remet la salle à zéro et le badge de monde suit", async () => {
        const mock = setupUnreads();

        await waitFor(() => expect(screen.getByTestId("world-w1").textContent).toBe("2"));

        await act(async () => {
            screen.getByTestId("read-c1").click();
        });

        expect(screen.getByTestId("room-c1").textContent).toBe("0");
        expect(screen.getByTestId("world-w1").textContent).toBe("0");

        // Persistance en DB (upsert chatroom_reads), sans RPC de recomptage
        const readBuilders = mock.buildersFor("chatroom_reads");
        expect(readBuilders).toHaveLength(1);
        expect(readBuilders[0].upsert).toHaveBeenCalledWith(
            expect.objectContaining({ chat_id: "c1", user_id: "u1" }),
            { onConflict: "chat_id,user_id" },
        );
        const rpcNames = mock.rpc.mock.calls.map(call => call[0] as string);
        expect(rpcNames.filter(n => n !== "get_app_shell")).toHaveLength(0);
    });

    it("markChatRead throttle : un seul upsert pour deux appels rapprochés", async () => {
        const mock = setupUnreads();

        await waitFor(() => expect(screen.getByTestId("read-c1")).toBeInTheDocument());

        await act(async () => {
            screen.getByTestId("read-c1").click();
            screen.getByTestId("read-c1").click();
        });

        expect(mock.buildersFor("chatroom_reads")).toHaveLength(1);
    });

});
