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

import { WorldChatroomsGrid } from "@/components/worlds/chatrooms/WorldChatroomsGrid";

type Room = {
  id: string;
  title: string | null;
  name: string | null;
  icon_url: string | null;
  last_message_at: string | null;
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
