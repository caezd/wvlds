import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

vi.mock("@/components/providers/NotificationsProvider", () => ({
  useNotifications: vi.fn(() => ({ roomUnread: {} })),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
  AvatarImage: ({ src }: { src?: string }) => <img src={src} alt="" />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { WorldChatroomsGrid } from "@/components/worlds/chatrooms/WorldChatroomsGrid";

type Room = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
  last_poster_avatar_url?: string | null;
  unread_count: number;
  category_id?: string | null;
};

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    title: "Sujet",
    name: null,
    icon_url: null,
    last_message_at: null,
    last_poster_avatar_url: null,
    unread_count: 0,
    category_id: null,
    ...overrides,
  };
}

describe("WorldChatroomsGrid — filtre par catégorie", () => {
  beforeEach(() => {
    const mock = createSupabaseMock();
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(mock.client);
  });

  const rooms: Room[] = [
    makeRoom({ id: "room-1", title: "Sujet catégorisé", category_id: "cat-1" }),
    makeRoom({ id: "room-2", title: "Sujet libre", category_id: null }),
  ];

  it("affiche toutes les rooms quand aucune catégorie n'est sélectionnée", () => {
    render(<WorldChatroomsGrid worldId="world-1" initialRooms={rooms} categoryId={null} />);
    expect(screen.getByText("Sujet catégorisé")).toBeInTheDocument();
    expect(screen.getByText("Sujet libre")).toBeInTheDocument();
  });

  it("ne garde que les rooms de la catégorie sélectionnée", () => {
    render(<WorldChatroomsGrid worldId="world-1" initialRooms={rooms} categoryId="cat-1" />);
    expect(screen.getByText("Sujet catégorisé")).toBeInTheDocument();
    expect(screen.queryByText("Sujet libre")).not.toBeInTheDocument();
  });

  it("filtre sur les rooms sans catégorie avec __uncategorized__", () => {
    render(<WorldChatroomsGrid worldId="world-1" initialRooms={rooms} categoryId="__uncategorized__" />);
    expect(screen.getByText("Sujet libre")).toBeInTheDocument();
    expect(screen.queryByText("Sujet catégorisé")).not.toBeInTheDocument();
  });

  it("affiche un message dédié quand le filtre ne retourne aucune room", () => {
    render(<WorldChatroomsGrid worldId="world-1" initialRooms={rooms} categoryId="cat-inexistante" />);
    expect(screen.getByText("Aucune partie dans cette catégorie.")).toBeInTheDocument();
  });
});

describe("WorldChatroomsGrid — sous-titre et avatar du dernier auteur", () => {
  beforeEach(() => {
    const mock = createSupabaseMock();
    (createClient as ReturnType<typeof vi.fn>).mockReturnValue(mock.client);
  });

  it("affiche toujours l'heure relative, jamais un extrait du message", () => {
    const room = makeRoom({ last_message_at: new Date().toISOString() });
    render(<WorldChatroomsGrid worldId="world-1" initialRooms={[room]} categoryId={null} />);
    expect(screen.getByText("À l'instant")).toBeInTheDocument();
  });

  it("superpose l'avatar du dernier auteur sur l'icône quand il est connu", () => {
    const room = makeRoom({ last_poster_avatar_url: "https://example.com/avatar.png" });
    const { container } = render(<WorldChatroomsGrid worldId="world-1" initialRooms={[room]} categoryId={null} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/avatar.png");
  });

  it("n'affiche pas d'avatar superposé quand le dernier auteur est inconnu", () => {
    const room = makeRoom({ last_poster_avatar_url: null });
    const { container } = render(<WorldChatroomsGrid worldId="world-1" initialRooms={[room]} categoryId={null} />);
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });
});
