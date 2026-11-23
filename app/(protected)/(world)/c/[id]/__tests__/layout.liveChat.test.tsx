import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const data = vi.hoisted(() => ({ chatroom: null as unknown, userId: "u1" as string | null }));
vi.mock("@/lib/currentRequest", () => ({ getCurrentUserId: async () => data.userId }));
vi.mock("../getChatroom", () => ({ getChatroomWithWorld: async () => ({ data: data.chatroom }) }));
vi.mock("@/components/worlds/sidebar/SidebarWorld", () => ({ SidebarWorldGuard: () => null }));
vi.mock("@/components/worlds/live-chat/WorldLiveChatAnchor", () => ({
  WorldLiveChatAnchor: ({ worldId }: { worldId: string }) => <span data-testid="live-chat-anchor">{worldId}</span>,
}));

import ChatRoomLayout from "../layout";

function salon(world: Record<string, unknown>) {
  return { id: "c1", world_id: "w1", worlds: { owner_id: "owner", world_members: [{ user_id: "u1" }], ...world } };
}
async function monter() {
  render(await ChatRoomLayout({ children: <p>salon</p>, params: Promise.resolve({ id: "c1" }) }));
}

beforeEach(() => {
  data.userId = "u1";
});

describe("layout d'un salon — chatbox du monde (migration 237)", () => {
  it("la déclare à la barre pour un membre, si le monde l'a activée", async () => {
    data.chatroom = salon({ enable_live_chat: true });
    await monter();
    expect(screen.getByTestId("live-chat-anchor")).toHaveTextContent("w1");
  });

  it("rien si le monde ne l'a pas activée (ou n'a pas la colonne)", async () => {
    data.chatroom = salon({ enable_live_chat: false });
    await monter();
    expect(screen.queryByTestId("live-chat-anchor")).toBeNull();
    data.chatroom = salon({});
    await monter();
    expect(screen.queryByTestId("live-chat-anchor")).toBeNull();
  });

  it("rien pour un visiteur, même chatbox activée", async () => {
    data.chatroom = salon({ enable_live_chat: true });
    data.userId = "visiteur";
    await monter();
    expect(screen.queryByTestId("live-chat-anchor")).toBeNull();
  });
});
