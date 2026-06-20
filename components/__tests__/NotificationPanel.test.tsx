import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppNotification } from "@/types/db";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockArchiveNotif = vi.fn().mockResolvedValue(undefined);
const mockLoadMoreNotifs = vi.fn().mockResolvedValue(undefined);
const mockMarkNotifRead = vi.fn().mockResolvedValue(undefined);
const mockMarkAllNotifsRead = vi.fn().mockResolvedValue(undefined);
const mockSetNotifPref = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();

vi.mock("@/components/providers/NotificationsProvider", () => ({
    useNotifications: vi.fn(),
}));

vi.mock("@/components/notifications/notif-panel-context", () => ({
    useNotifPanel: () => ({ open: true, toggle: vi.fn(), close: mockClose }),
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

vi.mock("@/components/worlds/WorldPreviewDialog", () => ({
    WorldPreviewDialog: () => null,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { NotificationInlinePanelContent } from "@/components/notifications/NotificationPanel";
import { useNotifications } from "@/components/providers/NotificationsProvider";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNotif(overrides: Partial<AppNotification> = {}): AppNotification {
    return {
        id: "n1",
        recipient_id: "u1",
        type: "mention",
        world_id: "w1",
        chat_id: "c1",
        message_id: 42,
        actor_id: "a1",
        actor_name: "alice",
        content: "général",
        metadata: null,
        read_at: null,
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
    };
}

function mockNotifications(overrides: Partial<ReturnType<typeof useNotifications>> = {}) {
    vi.mocked(useNotifications).mockReturnValue({
        notifications: [],
        unreadNotifCount: 0,
        markNotifRead: mockMarkNotifRead,
        markAllNotifsRead: mockMarkAllNotifsRead,
        archiveNotif: mockArchiveNotif,
        hasMoreNotifs: false,
        loadMoreNotifs: mockLoadMoreNotifs,
        notifPrefs: {},
        setNotifPref: mockSetNotifPref,
        worldUnread: {},
        roomUnread: {},
        setActiveChat: vi.fn(),
        markWorldSeen: vi.fn().mockResolvedValue(undefined),
        refreshAll: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockNotifications();
    // Mock Supabase avec le builder chaînable complet (inclut .in(), .maybeSingle(), etc.)
    vi.mocked(createClient).mockReturnValue(createSupabaseMock().client as never);
});

// ── État vide ─────────────────────────────────────────────────────────────────

describe("NotificationInlinePanelContent — état vide", () => {
    it("affiche l'icône cloche et 'Aucune notification' quand la liste est vide", () => {
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        expect(screen.getByText(/aucune notification/i)).toBeInTheDocument();
    });

    it("n'affiche pas le bouton 'tout lire' quand aucune notification non lue", () => {
        mockNotifications({ unreadNotifCount: 0 });
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        expect(screen.queryByTitle(/tout marquer comme lu/i)).not.toBeInTheDocument();
    });

    it("affiche le bouton 'tout lire' quand il y a des non-lus", () => {
        mockNotifications({
            notifications: [makeNotif()],
            unreadNotifCount: 1,
        });
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        expect(screen.getByTitle(/tout marquer comme lu/i)).toBeInTheDocument();
    });
});

// ── Rendu des notifications ───────────────────────────────────────────────────

describe("NotificationInlinePanelContent — liste", () => {
    it("affiche le texte d'une mention avec acteur et chatroom", () => {
        mockNotifications({
            notifications: [makeNotif({ actor_name: "alice", content: "général" })],
        });
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        expect(screen.getByText(/@alice vous a mentionné dans #général/i)).toBeInTheDocument();
    });

    it("affiche plusieurs notifications", () => {
        mockNotifications({
            notifications: [
                makeNotif({ id: "n1", actor_name: "alice", content: "lobby" }),
                makeNotif({ id: "n2", type: "new_member", actor_name: "bob", content: "Hextech" }),
            ],
        });
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        expect(screen.getByText(/@alice vous a mentionné dans #lobby/i)).toBeInTheDocument();
        expect(screen.getByText(/@bob a rejoint Hextech/i)).toBeInTheDocument();
    });
});

// ── Bouton archiver ───────────────────────────────────────────────────────────

describe("NotificationInlinePanelContent — archivage", () => {
    it("le bouton × est présent dans le DOM pour chaque notification", () => {
        mockNotifications({
            notifications: [makeNotif({ id: "n1" }), makeNotif({ id: "n2", actor_name: "bob" })],
        });
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        const btns = screen.getAllByRole("button", { name: /supprimer la notification/i });
        expect(btns).toHaveLength(2);
    });

    it("cliquer × appelle archiveNotif avec le bon id", async () => {
        const user = userEvent.setup();
        mockNotifications({ notifications: [makeNotif({ id: "notif-abc" })] });
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);

        await user.click(screen.getByRole("button", { name: /supprimer la notification/i }));
        expect(mockArchiveNotif).toHaveBeenCalledOnce();
        expect(mockArchiveNotif).toHaveBeenCalledWith("notif-abc");
    });

    it("× de la deuxième notification appelle archiveNotif avec le bon id", async () => {
        const user = userEvent.setup();
        mockNotifications({
            notifications: [
                makeNotif({ id: "n1" }),
                makeNotif({ id: "n2", actor_name: "bob" }),
            ],
        });
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);

        const btns = screen.getAllByRole("button", { name: /supprimer la notification/i });
        await user.click(btns[1]);
        expect(mockArchiveNotif).toHaveBeenCalledWith("n2");
        expect(mockArchiveNotif).not.toHaveBeenCalledWith("n1");
    });

    it("cliquer × n'appelle pas markNotifRead ni onClose", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        mockNotifications({ notifications: [makeNotif()] });
        render(<NotificationInlinePanelContent onClose={onClose} />);

        await user.click(screen.getByRole("button", { name: /supprimer la notification/i }));
        expect(mockMarkNotifRead).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });
});

// ── Pagination ────────────────────────────────────────────────────────────────

describe("NotificationInlinePanelContent — pagination", () => {
    it("affiche 'Toutes les notifications' quand hasMoreNotifs=false et liste non vide", () => {
        mockNotifications({
            notifications: [makeNotif()],
            hasMoreNotifs: false,
        });
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        expect(screen.getByText(/toutes les notifications/i)).toBeInTheDocument();
    });

    it("n'affiche pas 'Toutes les notifications' quand hasMoreNotifs=true", () => {
        mockNotifications({
            notifications: [makeNotif()],
            hasMoreNotifs: true,
        });
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        expect(screen.queryByText(/toutes les notifications/i)).not.toBeInTheDocument();
    });

    it("n'affiche pas 'Toutes les notifications' quand la liste est vide", () => {
        mockNotifications({ notifications: [], hasMoreNotifs: false });
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        expect(screen.queryByText(/toutes les notifications/i)).not.toBeInTheDocument();
    });
});

// ── Préférences ───────────────────────────────────────────────────────────────

describe("NotificationInlinePanelContent — préférences", () => {
    it("cliquer l'engrenage affiche la vue préférences", async () => {
        const user = userEvent.setup();
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        await user.click(screen.getByLabelText(/préférences/i));
        expect(screen.getByText(/^préférences$/i)).toBeInTheDocument();
    });

    it("cliquer Retour depuis les préférences revient à la liste", async () => {
        const user = userEvent.setup();
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        await user.click(screen.getByLabelText(/préférences/i));
        await user.click(screen.getByLabelText(/retour/i));
        expect(screen.getByText(/aucune notification/i)).toBeInTheDocument();
    });

    it("chaque type de notification a un switch dans les préférences", async () => {
        const user = userEvent.setup();
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        await user.click(screen.getByLabelText(/préférences/i));
        expect(screen.getByText(/mentions/i)).toBeInTheDocument();
        expect(screen.getByText(/réactions/i)).toBeInTheDocument();
        expect(screen.getByText(/nouveaux membres/i)).toBeInTheDocument();
        expect(screen.getByText(/nouvelles chatrooms/i)).toBeInTheDocument();
    });

    it("toggler un switch appelle setNotifPref", async () => {
        const user = userEvent.setup();
        mockNotifications({ notifPrefs: { mention: true } });
        render(<NotificationInlinePanelContent onClose={vi.fn()} />);
        await user.click(screen.getByLabelText(/préférences/i));
        const switches = screen.getAllByRole("switch");
        await user.click(switches[0]);
        expect(mockSetNotifPref).toHaveBeenCalledOnce();
    });
});
