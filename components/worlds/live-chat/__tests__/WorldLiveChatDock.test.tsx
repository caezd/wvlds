import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LiveChatMessage } from "@/hooks/useWorldLiveChat";

const flags = vi.hoisted(() => ({ world_live_chat: true }));
vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => flags,
}));

const worldMock = vi.hoisted(() => ({ id: "w1" as string | null, chatroom: null as { id: string; title: string } | null }));
vi.mock("@/lib/worldLiveChatStore", () => ({
  useLiveChatContext: () => (worldMock.id ? { worldId: worldMock.id, chatroom: worldMock.chatroom } : null),
}));

const channelsMock = vi.hoisted(() => ({
  channels: [] as { id: string; world_id: string; name: string; color: string | null; icon: string | null; sort_index: number }[],
}));
vi.mock("@/hooks/useLiveChannels", () => ({
  useLiveChannels: () => ({ channels: channelsMock.channels }),
}));
vi.mock("@/components/ui/LazyLucideIcon", () => ({
  LazyLucideIcon: ({ name }: { name: string }) => <svg data-icon={name} />,
}));

const chat = vi.hoisted(() => ({
  messages: [] as LiveChatMessage[],
  loading: false,
  presentCount: 3,
  send: vi.fn(async () => "ok"),
  remove: vi.fn(async () => true),
  userId: "me",
  unread: new Set<string>() as ReadonlySet<string>,
}));
// La salle demandée au hook, pour vérifier l'ouverture du fil d'un salon.
const placeSeen = vi.hoisted(() => ({ last: null as unknown }));
vi.mock("@/hooks/useWorldLiveChat", () => ({
  useWorldLiveChat: (_w: string, place: unknown) => {
    placeSeen.last = place;
    return chat;
  },
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
  worldMock.chatroom = null;
  channelsMock.channels = [];
  chat.unread = new Set();
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
    expect(chat.send).toHaveBeenCalledWith("salut", null);
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

  describe("salles, fil du salon et réponses (migration 238)", () => {
    const salle = (id: string, name: string, extra: Partial<{ color: string; icon: string }> = {}) => ({
      id, world_id: "w1", name, color: extra.color ?? null, icon: extra.icon ?? null, sort_index: 0,
    });

    it("des onglets : la principale, puis les salles du monde avec leur couleur et leur icône (# par défaut)", async () => {
      const user = userEvent.setup();
      channelsMock.channels = [salle("c1", "Hors-jeu", { color: "#ff8800", icon: "coffee" }), salle("c2", "Aide")];
      render(<WorldLiveChatDock />);
      await user.click(screen.getByTestId("world-live-chat-bar"));
      const tabs = within(screen.getByTestId("world-live-chat-places")).getAllByRole("tab");
      expect(tabs.map((t) => t.textContent)).toEqual(["Général", "Hors-jeu", "Aide"]);
      expect(tabs[0]).toHaveAttribute("aria-selected", "true");
      const horsJeu = tabs[1].querySelector("span[style]") as HTMLElement;
      expect(horsJeu.style.color).toBe("rgb(255, 136, 0)");
      expect(tabs[1].querySelector("[data-icon=coffee]")).not.toBeNull();
      await user.click(tabs[1]);
      expect(placeSeen.last).toEqual({ kind: "channel", id: "c1" });
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    });

    it("dans un salon, son fil s'ouvre de lui-même, en plus des salles existantes", async () => {
      const user = userEvent.setup();
      // Régression : liste et champ portaient la même clé (celle de la salle).
      const erreurs: string[] = [];
      const espion = vi.spyOn(console, "error").mockImplementation((...a) => { erreurs.push(a.map(String).join(" ")); });
      channelsMock.channels = [salle("c1", "Hors-jeu")];
      worldMock.chatroom = { id: "r1", title: "La taverne" };
      render(<WorldLiveChatDock />);
      expect(placeSeen.last).toEqual({ kind: "chatroom", id: "r1" });
      await user.click(screen.getByTestId("world-live-chat-bar"));
      const tabs = within(screen.getByTestId("world-live-chat-places")).getAllByRole("tab");
      expect(tabs.map((t) => t.textContent)).toEqual(["Général", "Hors-jeu", "La taverne"]);
      expect(tabs[2]).toHaveAttribute("aria-selected", "true");
      espion.mockRestore();
      expect(erreurs.filter((e) => /same key/.test(e))).toEqual([]);
    });

    it("une pastille signale une autre salle où un message est arrivé", async () => {
      const user = userEvent.setup();
      channelsMock.channels = [salle("c1", "Hors-jeu")];
      chat.unread = new Set(["c:c1"]);
      render(<WorldLiveChatDock />);
      expect(screen.getByTestId("world-live-chat-activity")).toBeInTheDocument();
      await user.click(screen.getByTestId("world-live-chat-bar"));
      const tabs = within(screen.getByTestId("world-live-chat-places")).getAllByRole("tab");
      expect(within(tabs[1]).getByTestId("world-live-chat-unread")).toBeInTheDocument();
    });

    it("un clic sur un message y répond ; l'envoi porte la réponse, Échap l'annule", async () => {
      const user = userEvent.setup();
      chat.messages = [msg("m1", "u2", "bob", "On joue ce soir ?")];
      render(<WorldLiveChatDock />);
      await user.click(screen.getByTestId("world-live-chat-bar"));
      await user.click(screen.getByText("On joue ce soir ?"));
      expect(screen.getByTestId("world-live-chat-replying")).toHaveTextContent("Réponse à bob");
      const input = screen.getByRole("textbox", { name: "Écrire dans le chat du monde…" });
      await user.keyboard("{Escape}");
      expect(screen.queryByTestId("world-live-chat-replying")).toBeNull();
      // Toujours ouvert : Échap a d'abord retiré la réponse.
      expect(screen.getByTestId("world-live-chat-panel")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Répondre à bob" }));
      await user.type(input, "Oui !{Enter}");
      await waitFor(() => expect(chat.send).toHaveBeenCalledWith("Oui !", "m1"));
      await waitFor(() => expect(screen.queryByTestId("world-live-chat-replying")).toBeNull());
    });

    it("une réponse montre le message cité, ou qu'il a été supprimé", async () => {
      const user = userEvent.setup();
      chat.messages = [
        { ...msg("m2", "me", "moi", "Oui !"), reply_to_id: "m1", reply: { id: "m1", content: "On joue ?", user_id: "u2", username: "bob" } },
        { ...msg("m3", "me", "moi", "Et toi ?", "2026-11-09T10:01:00Z"), reply_to_id: "m0", reply: null },
      ];
      render(<WorldLiveChatDock />);
      await user.click(screen.getByTestId("world-live-chat-bar"));
      const citations = screen.getAllByTestId("world-live-chat-quote");
      expect(citations[0]).toHaveTextContent("bobOn joue ?");
      expect(citations[1]).toHaveTextContent("Message supprimé");
    });
  });
});
