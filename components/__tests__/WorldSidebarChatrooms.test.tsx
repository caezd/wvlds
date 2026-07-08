import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, fireEvent, screen } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

vi.mock("@/components/providers/NotificationsProvider", () => ({
  useNotifications: vi.fn(() => ({ roomUnread: {} })),
}));

vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: vi.fn(() => ({ getUserPresence: () => null })),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "sidebar.active": "Actif",
      "sidebar.followed": "Suivi",
      "sidebar.all": "Tous",
      "sidebar.back": "Retour",
      "sidebar.general": "Général",
      "sidebar.noChatrooms": "Aucune chatroom",
      "sidebar.noChatroomsInCategory": "Aucune chatroom dans cette catégorie",
      "sidebar.subjects": `${opts?.count ?? 0} sujet(s)`,
    };
    return map[key] ?? key;
  },
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/c/room-1" }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  AvatarImage: ({ src }: { src?: string }) => <img src={src} alt="" />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { WorldSidebarChatrooms } from "@/components/worlds/WorldSidebarChatrooms";

// ── Helpers ───────────────────────────────────────────────────────────────────

type Room = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  unread_count: number;
  category_id: string | null;
  last_poster_avatar_url: string | null;
  last_poster_id: string | null;
  participant_count: number;
  second_poster_avatar_url: string | null;
};

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    title: "Ma chatroom",
    name: null,
    icon_url: null,
    last_message_at: "2024-01-01T10:00:00Z",
    unread_count: 0,
    category_id: null,
    last_poster_avatar_url: "https://example.com/avatar.png",
    last_poster_id: "user-1",
    participant_count: 1,
    second_poster_avatar_url: null,
    ...overrides,
  };
}

function renderSidebar(
  rooms: Room[],
  mock: ReturnType<typeof createSupabaseMock>,
  categories: { id: string; title: string; banner_url: string | null; icon_url: string | null; position: number }[] = [],
) {
  (createClient as ReturnType<typeof vi.fn>).mockReturnValue(mock.client);
  render(
    <WorldSidebarChatrooms
      worldId="world-1"
      initialAll={rooms}
      initialParticipated={[{ id: rooms[0]?.id ?? "room-1", title: rooms[0]?.title ?? null, name: null, icon_url: null, last_message_at: null, has_unread: false }]}
      initialFollowedIds={[]}
      categories={categories}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorldSidebarChatrooms — avatar via chatroom_summaries realtime", () => {
  let mock: ReturnType<typeof createSupabaseMock>;

  beforeEach(() => {
    mock = createSupabaseMock();
  });

  const avatarSrc = () => document.querySelector<HTMLImageElement>("img[src]")?.src ?? null;

  it("affiche l'avatar initial du dernier postant", () => {
    renderSidebar([makeRoom()], mock);
    expect(avatarSrc()).toBe("https://example.com/avatar.png");
  });

  it("met à jour l'avatar lorsque chatroom_summaries reçoit un UPDATE", async () => {
    renderSidebar([makeRoom()], mock);

    const channel = mock.lastChannel();
    expect(channel).toBeDefined();

    await act(async () => {
      channel!.emit(
        (h) => h.config.event === "UPDATE" && h.config.table === "chatroom_summaries",
        {
          new: {
            chat_id: "room-1",
            last_message_at: "2024-01-01T11:00:00Z",
            last_message_author_id: "user-2",
            last_message_persona_avatar_url: "https://example.com/persona-avatar.png",
          },
        },
      );
    });

    expect(avatarSrc()).toBe("https://example.com/persona-avatar.png");
  });

  it("efface l'avatar lorsque chatroom_summaries reçoit un DELETE (dernier message supprimé)", async () => {
    renderSidebar([makeRoom()], mock);

    const channel = mock.lastChannel();

    await act(async () => {
      channel!.emit(
        (h) => h.config.event === "DELETE" && h.config.table === "chatroom_summaries",
        { old: { chat_id: "room-1" } },
      );
    });

    // Après DELETE, last_poster_avatar_url est null → AvatarImage sans src → pas d'img[src]
    expect(avatarSrc()).toBeNull();
  });

  it("met à jour l'avatar sans null quand le nouveau message a un persona", async () => {
    renderSidebar([makeRoom({ last_poster_avatar_url: null, last_poster_id: null })], mock);

    const channel = mock.lastChannel();

    await act(async () => {
      channel!.emit(
        (h) => h.config.event === "UPDATE" && h.config.table === "chatroom_summaries",
        {
          new: {
            chat_id: "room-1",
            last_message_at: "2024-01-02T09:00:00Z",
            last_message_author_id: "user-3",
            last_message_persona_avatar_url: "https://example.com/new-persona.png",
          },
        },
      );
    });

    expect(avatarSrc()).toBe("https://example.com/new-persona.png");
  });
});

describe("WorldSidebarChatrooms — drill-down catégories", () => {
  let mock: ReturnType<typeof createSupabaseMock>;

  beforeEach(() => {
    mock = createSupabaseMock();
  });

  it("affiche les chatrooms non catégorisées en ouvrant 'Général'", () => {
    const rooms = [
      makeRoom({ id: "room-1", title: "Sujet libre 1", category_id: null }),
      makeRoom({ id: "room-2", title: "Sujet libre 2", category_id: null }),
      makeRoom({ id: "room-3", title: "Sujet catégorisé", category_id: "cat-1" }),
    ];
    renderSidebar(rooms, mock, [
      { id: "cat-1", title: "Annonces", banner_url: null, icon_url: null, position: 0 },
    ]);

    // Le compteur affiche bien 2 sujets non catégorisés
    expect(screen.getByText("2 sujet(s)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Général"));

    // Bug de régression : la vue détail affichait "Aucune chatroom dans cette catégorie"
    // alors que le compteur annonçait 2 sujets.
    expect(screen.queryByText("Aucune chatroom dans cette catégorie")).not.toBeInTheDocument();
    expect(screen.getByText("Sujet libre 1")).toBeInTheDocument();
    expect(screen.getByText("Sujet libre 2")).toBeInTheDocument();
    expect(screen.queryByText("Sujet catégorisé")).not.toBeInTheDocument();
  });

  it("affiche les chatrooms d'une catégorie réelle", () => {
    const rooms = [
      makeRoom({ id: "room-1", title: "Sujet catégorisé", category_id: "cat-1" }),
      makeRoom({ id: "room-2", title: "Sujet libre", category_id: null }),
    ];
    renderSidebar(rooms, mock, [
      { id: "cat-1", title: "Annonces", banner_url: null, icon_url: null, position: 0 },
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Annonces/ }));

    expect(screen.queryByText("Aucune chatroom dans cette catégorie")).not.toBeInTheDocument();
    expect(screen.getByText("Sujet catégorisé")).toBeInTheDocument();
    expect(screen.queryByText("Sujet libre")).not.toBeInTheDocument();
  });
});
