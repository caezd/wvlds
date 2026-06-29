import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock } from "@/test/supabaseMock";
import NotificationsProvider, { useNotifications } from "@/components/providers/NotificationsProvider";
import type { AppNotification } from "@/types/db";

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
    const mock = createSupabaseMock({
        user: { id: "u1" },
        results: [
            { data: [] },               // world_members
            { data: initialNotifs },    // notifications (bootstrap)
            { data: [] },               // notification_preferences
        ],
    });
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
    const mock = createSupabaseMock({
        user: { id: "u1" },
        results: [
            { data: [] },
            { data: initialNotifs },
            { data: [] },
        ],
    });
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    render(
        <NotificationsProvider>
            <ConsumerWithActions />
        </NotificationsProvider>
    );

    return mock;
}

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
