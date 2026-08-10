import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { ChatroomsNavDropdown, type NavRoom } from "@/components/chatrooms/settings/ChatroomsNavDropdown";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/components/providers/NotificationsProvider", () => ({
  useNotifications: () => ({ roomUnread: {} }),
}));
vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

function makeRooms(count: number): NavRoom[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `room-${i}`,
    title: `Salle ${i}`,
    name: null,
    icon_url: null,
    last_message_at: null,
    unread_count: 0,
  }));
}

function setup() {
  const mock = createSupabaseMock({ user: { id: "u1" } });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChatroomsNavDropdown — ne liste que les salons où l'utilisateur participe", () => {
  it("appelle list_participated_chatrooms (pas list_chatrooms_nav) à l'ouverture", async () => {
    const mock = setup();
    mock.rpc.mockResolvedValue({
      data: [{ id: "room-a", title: "Salle A", name: null, icon_url: null, last_message_at: null, has_unread: false }],
      error: null,
    });
    const user = userEvent.setup();
    render(
      <ChatroomsNavDropdown worldId="w1" currentChatId="current" label="Salle actuelle" initialRooms={makeRooms(1)} />,
    );

    await user.click(screen.getByLabelText("Conversations du monde"));

    await waitFor(() => {
      expect(mock.rpc).toHaveBeenCalledWith("list_participated_chatrooms", { p_world_id: "w1", p_limit: 100 });
    });
    expect(mock.rpc).not.toHaveBeenCalledWith("list_chatrooms_nav", expect.anything());
  });

  it("affiche les salles renvoyées par list_participated_chatrooms (champ has_unread, pas unread_count)", async () => {
    const mock = setup();
    mock.rpc.mockResolvedValue({
      data: [{ id: "room-a", title: "Salle participée", name: null, icon_url: null, last_message_at: null, has_unread: true }],
      error: null,
    });
    const user = userEvent.setup();
    render(
      <ChatroomsNavDropdown worldId="w1" currentChatId="current" label="Salle actuelle" initialRooms={makeRooms(1)} />,
    );

    await user.click(screen.getByLabelText("Conversations du monde"));

    expect(await screen.findByText("Salle participée")).toBeInTheDocument();
  });
});

describe("ChatroomsNavDropdown — charge la suite sans avoir besoin de scroller quand la liste ne déborde pas", () => {
  it("affiche plus de 5 salons dès l'ouverture même sans événement de scroll", async () => {
    const rooms = makeRooms(8);
    const user = userEvent.setup();
    render(
      <ChatroomsNavDropdown worldId={null} currentChatId="current" label="Salle actuelle" initialRooms={rooms} />,
    );

    await user.click(screen.getByLabelText("Conversations du monde"));

    await waitFor(() => {
      expect(screen.getByText("Salle 7")).toBeInTheDocument();
    });
  });

  it("masque l'indice \"faites défiler\" une fois tous les salons chargés", async () => {
    const rooms = makeRooms(8);
    const user = userEvent.setup();
    render(
      <ChatroomsNavDropdown worldId={null} currentChatId="current" label="Salle actuelle" initialRooms={rooms} />,
    );

    await user.click(screen.getByLabelText("Conversations du monde"));

    await waitFor(() => {
      expect(screen.queryByText("Faites défiler pour en voir plus…")).not.toBeInTheDocument();
    });
  });
});
