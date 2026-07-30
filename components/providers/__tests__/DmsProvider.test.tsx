import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { createClient } from "@/lib/supabase/client";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabaseMock";
import DmsProvider, { useDms } from "@/components/providers/DmsProvider";

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
    const { activeConvId, openConversation } = useDms();
    return (
        <>
            <span data-testid="active-conv">{activeConvId ?? ""}</span>
            <button data-testid="open" onClick={() => void openConversation("other1")}>
                ouvrir
            </button>
        </>
    );
}

// `.from()` est consommé dans l'ordre : le select historique de messages
// (openConversation), puis l'upsert de markConvRead.
function setup() {
    const mock = createSupabaseMock({
        user: { id: "u1" },
        results: [{ data: [] }, { data: null }],
    });
    mockRpc(mock);
    vi.mocked(createClient).mockReturnValue(mock.client as never);

    const view = render(
        <DmsProvider>
            <Consumer />
        </DmsProvider>,
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
