import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LiveChatMessage } from "@/hooks/useWorldLiveChat";

const flags = vi.hoisted(() => ({ world_live_chat: true }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => flags,
}));

const worldMock = vi.hoisted(() => ({ id: "w1" as string | null }));
vi.mock("@/lib/worldLiveChatStore", () => ({
  useLiveChatWorldId: () => worldMock.id,
}));

const chat = vi.hoisted(() => ({
  messages: [] as LiveChatMessage[],
  loading: false,
  presentCount: 3,
  send: vi.fn(async () => "ok"),
  remove: vi.fn(async () => true),
  userId: "me",
}));
vi.mock("@/hooks/useWorldLiveChat", () => ({
  useWorldLiveChat: () => chat,
}));

// Le profil s'ouvre dans un tiroir : hors sujet ici.
vi.mock("@/components/profile/UserProfileSheetTrigger", () => ({
  UserProfileSheetTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import { WorldLiveChatDock, isGrouped } from "@/components/worlds/live-chat/WorldLiveChatDock";

const msg = (id: string, user_id: string, username: string, content: string, created_at = "2026-11-09T10:00:00Z"): LiveChatMessage => ({
  id, world_id: "w1", user_id, content, created_at, author: { username, avatar_url: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  flags.world_live_chat = true;
  worldMock.id = "w1";
  chat.messages = [];
  chat.presentCount = 3;
  chat.send.mockResolvedValue("ok");
});

describe("WorldLiveChatDock", () => {
  it("ne rend rien si le drapeau est éteint", () => {
    flags.world_live_chat = false;
    const { container } = render(<WorldLiveChatDock />);
    expect(container).toBeEmptyDOMElement();
  });

  it("ne rend rien hors d'un monde", () => {
    worldMock.id = null;
    const { container } = render(<WorldLiveChatDock />);
    expect(container).toBeEmptyDOMElement();
  });

  it("la barre montre le dernier message, son auteur et les présents", () => {
    chat.messages = [msg("a", "u1", "alice", "premier"), msg("b", "u2", "bob", "dernier")];
    render(<WorldLiveChatDock />);
    const bar = screen.getByTestId("world-live-chat-bar");
    expect(bar).toHaveTextContent("bob");
    expect(bar).toHaveTextContent("dernier");
    expect(bar).not.toHaveTextContent("premier");
    expect(screen.getByTestId("world-live-chat-present")).toHaveTextContent("3");
  });

  it("s'ouvre en panneau au clic, et se referme", async () => {
    const user = userEvent.setup();
    chat.messages = [msg("a", "u1", "alice", "bonjour")];
    render(<WorldLiveChatDock />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    const panel = screen.getByTestId("world-live-chat-panel");
    expect(panel).toHaveClass("h-[50dvh]");
    expect(screen.getByRole("log")).toHaveTextContent("bonjour");
    await user.click(screen.getByRole("button", { name: "Fermer le chat" }));
    expect(screen.getByTestId("world-live-chat-bar")).toBeInTheDocument();
  });

  it("affiche l'invitation à écrire quand le fil est vide", async () => {
    const user = userEvent.setup();
    render(<WorldLiveChatDock />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    expect(screen.getByText(/Aucun message pour l’instant/)).toBeInTheDocument();
  });

  it("envoie à Entrée et vide le champ", async () => {
    const user = userEvent.setup();
    render(<WorldLiveChatDock />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    const input = screen.getByRole("textbox", { name: "Écrire dans le chat du monde…" });
    await user.type(input, "salut{Enter}");
    expect(chat.send).toHaveBeenCalledWith("salut");
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("garde le texte et prévient quand le rythme est dépassé", async () => {
    chat.send.mockResolvedValue("too_fast");
    const user = userEvent.setup();
    render(<WorldLiveChatDock />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    const input = screen.getByRole("textbox", { name: "Écrire dans le chat du monde…" });
    await user.type(input, "vite{Enter}");
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Trop de messages : patientez un instant."));
    expect(input).toHaveValue("vite");
  });

  it("propose d'effacer ses seuls messages", async () => {
    const user = userEvent.setup();
    chat.messages = [msg("a", "u1", "alice", "à elle"), msg("b", "me", "moi", "à moi", "2026-11-09T10:10:00Z")];
    render(<WorldLiveChatDock />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    const buttons = screen.getAllByRole("button", { name: "Supprimer le message" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    expect(chat.remove).toHaveBeenCalledWith("b");
  });

  it("Échap referme le panneau depuis le champ", async () => {
    const user = userEvent.setup();
    render(<WorldLiveChatDock />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    await user.type(screen.getByRole("textbox"), "{Escape}");
    expect(screen.getByTestId("world-live-chat-bar")).toBeInTheDocument();
  });
});

describe("isGrouped", () => {
  it("regroupe un même auteur à moins de cinq minutes", () => {
    const a = msg("a", "u1", "alice", "1", "2026-11-09T10:00:00Z");
    expect(isGrouped(a, msg("b", "u1", "alice", "2", "2026-11-09T10:04:00Z"))).toBe(true);
    expect(isGrouped(a, msg("c", "u1", "alice", "3", "2026-11-09T10:06:00Z"))).toBe(false);
    expect(isGrouped(a, msg("d", "u2", "bob", "4", "2026-11-09T10:01:00Z"))).toBe(false);
    expect(isGrouped(undefined, a)).toBe(false);
  });
});
