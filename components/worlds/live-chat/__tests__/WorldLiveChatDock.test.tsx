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
  hasOlder: false,
  loadingOlder: false,
  loadOlder: vi.fn(async (): Promise<number | null> => 0),
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

// jsdom fournit un localStorage partiel (pas de .clear()) : même remplacement
// que components/__tests__/ChatroomComposerDraft.test.tsx.
const _store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => _store[key] ?? null,
  setItem: (key: string, value: string) => { _store[key] = value; },
  removeItem: (key: string) => { delete _store[key]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
});

// Options de la chatbox (migration 241), éteintes sauf mention.
const optionsMock = vi.hoisted(() => ({
  value: { colors: false, bubbles: false, personas: false, actions: false },
}));
vi.mock("@/hooks/useLiveChatOptions", () => ({ useLiveChatOptions: () => optionsMock.value }));
// Teintes des groupes de personas : persona → couleur.
const tintsMock = vi.hoisted(() => ({ value: {} as Record<string, string> }));
vi.mock("@/hooks/usePersonaTints", () => ({ usePersonaTints: () => tintsMock.value }));
// Le vrai sélecteur charge les personas : ici, un bouton qui en choisit un.
vi.mock("@/components/personas/PersonaPickerDialog", () => ({
  PersonaPickerDialog: ({ trigger, onSelect }: { trigger: React.ReactNode; onSelect: (p: unknown) => void }) => (
    <>
      {trigger}
      <button type="button" onClick={() => onSelect({ id: "p1", name: "Lyra", avatar_url: null, dialogue_color: "#f87171" })}>
        choisir Lyra
      </button>
    </>
  ),
}));

import { WorldLiveChatDock, isGrouped, useLiveChatDockLayout } from "@/components/worlds/live-chat/WorldLiveChatDock";
import { __resetLiveChatLayout } from "@/lib/liveChatLayout";

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
  chat.hasOlder = false;
  chat.loadingOlder = false;
  chat.loadOlder.mockResolvedValue(0);
  optionsMock.value = { colors: false, bubbles: false, personas: false, actions: false };
  tintsMock.value = {};
  localStorage.clear();
  __resetLiveChatLayout();
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
    expect(panel).toHaveClass("h-[var(--live-chat-height,50dvh)]");
    expect(screen.getByRole("log")).toHaveTextContent("bonjour");
    await user.click(screen.getByRole("button", { name: "Fermer le chat" }));
    expect(screen.getByTestId("world-live-chat-bar")).toBeInTheDocument();
  });

  it("retient le dernier choix, ouvert ou fermé, d'un chargement à l'autre", async () => {
    const user = userEvent.setup();
    const premier = render(<WorldLiveChatDock />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    premier.unmount();
    __resetLiveChatLayout();

    const second = render(<WorldLiveChatDock />);
    expect(screen.getByTestId("world-live-chat-panel")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "{Escape}");
    second.unmount();
    __resetLiveChatLayout();

    render(<WorldLiveChatDock />);
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
    expect(chat.send).toHaveBeenCalledWith("salut", null, { color: null, personaId: null, isAction: false });
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("après un envoi au bouton, le curseur revient dans le champ, resté actif pendant l'envoi", async () => {
    const user = userEvent.setup();
    let finish: (v: string) => void = () => {};
    chat.send.mockImplementation(() => new Promise<string>((r) => { finish = r; }));
    render(<WorldLiveChatDock />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    const input = screen.getByRole("textbox", { name: "Écrire dans le chat du monde…" });
    await user.type(input, "salut");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    // Pendant l'envoi : en lecture seule, jamais désactivé (il perdrait le curseur).
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute("readonly");
    finish("ok");
    await waitFor(() => expect(input).toHaveValue(""));
    expect(input).toHaveFocus();
    expect(input).not.toHaveAttribute("readonly");
  });

  it("une ligne de message n'a pas de fond au survol", async () => {
    chat.messages = [msg("a", "u1", "alice", "bonjour")];
    render(<WorldLiveChatDock />);
    await userEvent.setup().click(screen.getByTestId("world-live-chat-bar"));
    const row = screen.getByRole("log").querySelector("[data-live-message='a']")!;
    expect(row.className).not.toMatch(/hover:bg-/);
  });

  it("les actions se calent sur le texte, avec ou sans en-tête", async () => {
    // b suit a du même auteur à une minute : regroupé, sans en-tête.
    chat.messages = [
      msg("a", "u1", "alice", "premier", "2026-11-09T10:00:00Z"),
      msg("b", "u1", "alice", "ok", "2026-11-09T10:01:00Z"),
    ];
    render(<WorldLiveChatDock />);
    await userEvent.setup().click(screen.getByTestId("world-live-chat-bar"));
    const actions = screen.getAllByTestId("world-live-chat-actions");
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.parentElement!.querySelector("p")!.textContent)).toEqual(["premier", "ok"]);
    for (const a of actions) expect(a).toHaveClass("top-0", "h-5");
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

/** Ce que la coquille de l'application lit pour placer la page et le dock. */
function Coquille() {
  const { side, fullscreen } = useLiveChatDockLayout();
  return (
    <>
      <output data-testid="coquille">{`${side ? "droite" : "bas"}${fullscreen ? " plein" : ""}`}</output>
      <WorldLiveChatDock />
    </>
  );
}

describe("WorldLiveChatDock — plein écran et emplacement", () => {
  it("ouvert, il passe en plein écran puis en sort ; le refermer quitte le plein écran", async () => {
    const user = userEvent.setup();
    render(<Coquille />);
    // Fermé, rien à agrandir.
    expect(screen.queryByRole("button", { name: "Plein écran" })).toBeNull();
    await user.click(screen.getByTestId("world-live-chat-bar"));
    await user.click(screen.getByRole("button", { name: "Plein écran" }));
    expect(screen.getByTestId("world-live-chat-panel")).toHaveAttribute("data-fullscreen", "true");
    expect(screen.getByTestId("coquille")).toHaveTextContent("bas plein");
    await user.click(screen.getByRole("button", { name: "Quitter le plein écran" }));
    expect(screen.getByTestId("world-live-chat-panel")).not.toHaveAttribute("data-fullscreen");
    expect(screen.getByTestId("coquille")).toHaveTextContent(/^bas$/);

    await user.click(screen.getByRole("button", { name: "Plein écran" }));
    await user.click(screen.getByRole("button", { name: "Fermer le chat" }));
    expect(screen.getByTestId("coquille")).toHaveTextContent(/^bas$/);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    expect(screen.getByTestId("world-live-chat-panel")).not.toHaveAttribute("data-fullscreen");
  });

  it("en bas ou à droite : le choix est retenu d'un chargement à l'autre ; fermé, il reste une barre en bas", async () => {
    const user = userEvent.setup();
    const premier = render(<Coquille />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    expect(screen.getByTestId("world-live-chat-panel")).toHaveAttribute("data-placement", "bottom");
    await user.click(screen.getByRole("button", { name: "Afficher à droite" }));
    expect(screen.getByTestId("world-live-chat-panel")).toHaveAttribute("data-placement", "side");
    expect(screen.getByTestId("coquille")).toHaveTextContent(/^droite$/);
    premier.unmount();
    __resetLiveChatLayout();

    render(<Coquille />);
    expect(screen.getByTestId("world-live-chat-panel")).toHaveAttribute("data-placement", "side");
    await user.click(screen.getByRole("button", { name: "Fermer le chat" }));
    expect(screen.getByTestId("coquille")).toHaveTextContent(/^bas$/);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    await user.click(screen.getByRole("button", { name: "Afficher en bas" }));
    expect(screen.getByTestId("world-live-chat-panel")).toHaveAttribute("data-placement", "bottom");
  });

  it("en bas, la poignée entre la page et le chat règle sa hauteur ; la taille est retenue", async () => {
    const user = userEvent.setup();
    const premier = render(<Coquille />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    const poignee = screen.getByRole("separator", { name: "Redimensionner le chat" });
    expect(poignee).toHaveAttribute("aria-orientation", "horizontal");
    // Sans réglage, la moitié de l'écran ; la première flèche part de la taille affichée.
    vi.spyOn(screen.getByTestId("world-live-chat-panel"), "getBoundingClientRect").mockReturnValue({ height: 400, width: 800 } as DOMRect);
    poignee.focus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByTestId("world-live-chat-panel").style.getPropertyValue("--live-chat-height")).toBe("464px");
    await user.keyboard("{ArrowDown}");
    expect(localStorage.getItem("liveChat:height")).toBe("432");
    premier.unmount();
    __resetLiveChatLayout();

    render(<Coquille />);
    expect(screen.getByTestId("world-live-chat-panel").style.getPropertyValue("--live-chat-height")).toBe("432px");
  });

  it("à droite, la poignée règle sa largeur ; en plein écran, il n'y en a pas", async () => {
    const user = userEvent.setup();
    localStorage.setItem("liveChat:open", "1");
    localStorage.setItem("liveChat:placement", "side");
    localStorage.setItem("liveChat:width", "384");
    render(<Coquille />);
    const poignee = screen.getByRole("separator", { name: "Redimensionner le chat" });
    expect(poignee).toHaveAttribute("aria-orientation", "vertical");
    poignee.focus();
    // Le chat est à droite : la flèche gauche l'élargit.
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("world-live-chat-panel").style.getPropertyValue("--live-chat-width")).toBe("416px");
    expect(localStorage.getItem("liveChat:width")).toBe("416");
    await user.click(screen.getByRole("button", { name: "Plein écran" }));
    expect(screen.queryByRole("separator", { name: "Redimensionner le chat" })).toBeNull();
  });

  it("hors d'un monde, la coquille garde sa mise en page, même si le dernier choix était ouvert à droite", () => {
    localStorage.setItem("liveChat:open", "1");
    localStorage.setItem("liveChat:placement", "side");
    worldMock.id = null;
    render(<Coquille />);
    expect(screen.getByTestId("coquille")).toHaveTextContent(/^bas$/);
  });
});

describe("WorldLiveChatDock — remontée de l'historique (migration 240)", () => {
  it("pas de bouton quand tout le fil est déjà là", async () => {
    chat.messages = [msg("a", "u1", "alice", "bonjour")];
    render(<WorldLiveChatDock />);
    await userEvent.setup().click(screen.getByTestId("world-live-chat-bar"));
    expect(screen.queryByRole("button", { name: "Messages précédents" })).toBeNull();
  });

  it("« Messages précédents » remonte d'une page", async () => {
    const user = userEvent.setup();
    chat.messages = [msg("a", "u1", "alice", "bonjour")];
    chat.hasOlder = true;
    chat.loadOlder.mockResolvedValue(50);
    render(<WorldLiveChatDock />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    await user.click(screen.getByRole("button", { name: "Messages précédents" }));
    expect(chat.loadOlder).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("un échec de lecture se signale", async () => {
    const user = userEvent.setup();
    chat.messages = [msg("a", "u1", "alice", "bonjour")];
    chat.hasOlder = true;
    chat.loadOlder.mockResolvedValue(null);
    render(<WorldLiveChatDock />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    await user.click(screen.getByRole("button", { name: "Messages précédents" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Chargement des messages précédents impossible."));
  });

  it("pendant la lecture, le bouton attend", async () => {
    chat.messages = [msg("a", "u1", "alice", "bonjour")];
    chat.hasOlder = true;
    chat.loadingOlder = true;
    render(<WorldLiveChatDock />);
    await userEvent.setup().click(screen.getByTestId("world-live-chat-bar"));
    expect(screen.getByRole("button", { name: "Chargement…" })).toBeDisabled();
  });
});

describe("WorldLiveChatDock — options du monde (migration 241)", () => {
  const ouvrir = async () => {
    const user = userEvent.setup();
    render(<WorldLiveChatDock />);
    await user.click(screen.getByTestId("world-live-chat-bar"));
    return user;
  };
  const avecPersona = (m: LiveChatMessage): LiveChatMessage => ({
    ...m, persona_id: "p1", persona: { id: "p1", name: "Lyra", avatar_url: null }, color: "#f87171",
  });

  it("options éteintes : ni persona, ni couleur, ni bulle, ni sélecteurs", async () => {
    chat.messages = [avecPersona(msg("a", "u1", "alice", "bonjour"))];
    await ouvrir();
    expect(screen.getByTestId("world-live-chat-author")).toHaveTextContent(/^alice$/);
    expect(screen.getByText("bonjour")).not.toHaveAttribute("style");
    expect(screen.queryByTestId("world-live-chat-bubble")).toBeNull();
    expect(screen.queryByTestId("world-live-chat-persona")).toBeNull();
    expect(screen.queryByRole("button", { name: "Couleur des dialogues" })).toBeNull();
  });

  it("personas : le message est signé « joueur avec persona »", async () => {
    optionsMock.value = { ...optionsMock.value, personas: true };
    chat.messages = [avecPersona(msg("a", "u1", "alice", "bonjour"))];
    await ouvrir();
    expect(screen.getByTestId("world-live-chat-author")).toHaveTextContent("alice avec Lyra");
  });

  it("personas : le nom du persona prend la couleur de son groupe, le joueur garde la sienne", async () => {
    optionsMock.value = { ...optionsMock.value, personas: true, actions: true };
    tintsMock.value = { p1: "#22c55e" };
    chat.messages = [
      avecPersona(msg("a", "u1", "alice", "bonjour")),
      { ...avecPersona(msg("b", "u1", "alice", "salue.", "2026-11-09T10:10:00Z")), is_action: true },
    ];
    await ouvrir();
    const auteur = screen.getByTestId("world-live-chat-author");
    expect(within(auteur).getByText("Lyra")).toHaveStyle({ color: "#22c55e" });
    expect(within(auteur).getByText("alice").getAttribute("style") ?? "").not.toMatch(/color/);
    expect(within(screen.getByTestId("world-live-chat-action")).getByText("Lyra")).toHaveStyle({ color: "#22c55e" });
  });

  it("personas : sans couleur de groupe, le nom garde la couleur du texte", async () => {
    optionsMock.value = { ...optionsMock.value, personas: true };
    tintsMock.value = { autre: "#22c55e" };
    chat.messages = [avecPersona(msg("a", "u1", "alice", "bonjour"))];
    await ouvrir();
    expect(within(screen.getByTestId("world-live-chat-author")).getByText("Lyra").getAttribute("style") ?? "").not.toMatch(/color/);
  });

  it("couleurs : le texte prend la couleur du message, si elle se lit", async () => {
    optionsMock.value = { ...optionsMock.value, colors: true };
    chat.messages = [
      { ...msg("a", "u1", "alice", "rouge"), color: "#f87171" },
      { ...msg("b", "u2", "bob", "noir", "2026-11-09T10:10:00Z"), color: "#000000" },
      { ...msg("c", "u3", "carole", "vert pâle", "2026-11-09T10:20:00Z"), color: "#4ade804d" },
    ];
    await ouvrir();
    expect(screen.getByText("rouge")).toHaveStyle({ color: "#f87171" });
    // Transparente : le texte prend sa teinte opaque, l'opacité ne vaut que pour les bulles.
    expect(screen.getByText("vert pâle")).toHaveStyle({ color: "#4ade80" });
    // Illisible sur le fond sombre : couleur par défaut.
    expect(screen.getByText("noir").getAttribute("style") ?? "").not.toMatch(/color/);
  });

  it("couleurs : le réglage d'opacité n'existe qu'avec les bulles, et part opaque sans elles", async () => {
    optionsMock.value = { ...optionsMock.value, colors: true };
    localStorage.setItem("liveChat:color:w1", "#4ade804d");
    const user = await ouvrir();
    await user.click(screen.getByRole("button", { name: "Couleur des dialogues" }));
    expect(screen.queryByRole("slider", { name: "Opacité" })).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "Écrire dans le chat du monde…" }), "salut{Enter}");
    expect(chat.send).toHaveBeenCalledWith("salut", null, { color: "#4ade80", personaId: null, isAction: false });
  });

  it("bulles : le sélecteur garde l'opacité, et la couleur part telle quelle", async () => {
    optionsMock.value = { ...optionsMock.value, colors: true, bubbles: true };
    localStorage.setItem("liveChat:color:w1", "#4ade804d");
    const user = await ouvrir();
    await user.click(screen.getByRole("button", { name: "Couleur des dialogues" }));
    expect(screen.getByRole("slider", { name: "Opacité" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Écrire dans le chat du monde…" }), "salut{Enter}");
    expect(chat.send).toHaveBeenCalledWith("salut", null, { color: "#4ade804d", personaId: null, isAction: false });
  });

  it("bulles : toutes à gauche, avec nom ; les siennes se distinguent par leur fond", async () => {
    optionsMock.value = { ...optionsMock.value, bubbles: true };
    chat.messages = [msg("a", "u1", "alice", "salut"), msg("b", "me", "moi", "coucou", "2026-11-09T10:10:00Z")];
    await ouvrir();
    const bulles = screen.getAllByTestId("world-live-chat-bubble");
    expect(bulles.map((b) => b.textContent)).toEqual(["salut", "coucou"]);
    const mienne = screen.getByRole("log").querySelector("[data-live-message='b']")!;
    expect(mienne).toHaveAttribute("data-mine", "true");
    expect(within(mienne as HTMLElement).getByTestId("world-live-chat-author")).toHaveTextContent("moi");
    expect(bulles[0]).toHaveClass("bg-muted");
    expect(bulles[1]).toHaveClass("bg-primary");
  });

  it("bulles : un groupe a son avatar et son nom en haut, et des coins resserrés entre ses bulles", async () => {
    optionsMock.value = { ...optionsMock.value, bubbles: true };
    chat.messages = [
      msg("a", "u1", "alice", "un", "2026-11-09T10:00:00Z"),
      msg("b", "u1", "alice", "deux", "2026-11-09T10:01:00Z"),
      msg("c", "u1", "alice", "trois", "2026-11-09T10:02:00Z"),
      msg("d", "u2", "bob", "seul", "2026-11-09T10:03:00Z"),
    ];
    await ouvrir();
    const row = (id: string) => screen.getByRole("log").querySelector<HTMLElement>(`[data-live-message='${id}']`)!;
    const hasAvatar = (id: string) => row(id).firstElementChild!.childElementCount > 0;
    const hasName = (id: string) => within(row(id)).queryByTestId("world-live-chat-author") !== null;
    expect(["a", "b", "c", "d"].map(hasAvatar)).toEqual([true, false, false, true]);
    expect(["a", "b", "c", "d"].map(hasName)).toEqual([true, false, false, true]);
    const bulle = (id: string) => within(row(id)).getByTestId("world-live-chat-bubble");
    expect(bulle("a")).toHaveClass("rounded-bl-md");
    expect(bulle("a")).not.toHaveClass("rounded-tl-md");
    expect(bulle("b")).toHaveClass("rounded-tl-md", "rounded-bl-md");
    expect(bulle("c")).toHaveClass("rounded-tl-md");
    expect(bulle("c")).not.toHaveClass("rounded-bl-md");
    expect(bulle("d")).not.toHaveClass("rounded-tl-md");
    expect(bulle("d")).not.toHaveClass("rounded-bl-md");
  });

  it("bulles : une action /me prend l'espacement et le retrait des bulles", async () => {
    optionsMock.value = { ...optionsMock.value, bubbles: true, actions: true };
    chat.messages = [
      msg("a", "u1", "alice", "salut", "2026-11-09T10:00:00Z"),
      { ...msg("b", "u1", "alice", "ouvre la porte.", "2026-11-09T10:01:00Z"), is_action: true },
    ];
    await ouvrir();
    const row = (id: string) => screen.getByRole("log").querySelector<HTMLElement>(`[data-live-message='${id}']`)!;
    // Même espacement de ligne que les bulles, sans marge de droite.
    expect(row("b").className.split(" ").filter((c) => /^(gap|mt|pt|pb|py|pr)-/.test(c)).sort())
      .toEqual(row("a").className.split(" ").filter((c) => /^(gap|mt|pt|pb|py|pr)-/.test(c)).sort());
    const action = screen.getByTestId("world-live-chat-action");
    expect(action).toHaveClass("px-3", "py-1.5");
    expect(within(row("b")).getByTestId("world-live-chat-actions")).toHaveClass("left-full");
  });

  it("actions : /me part en action jouée", async () => {
    optionsMock.value = { ...optionsMock.value, actions: true };
    const user = await ouvrir();
    const input = screen.getByRole("textbox", { name: "Écrire dans le chat du monde…" });
    expect(input).toHaveAttribute("placeholder", "Écrire dans le chat du monde… (/me pour une action)");
    await user.type(input, "/me se rend à la porte.{Enter}");
    expect(chat.send).toHaveBeenCalledWith("se rend à la porte.", null, { color: null, personaId: null, isAction: true });
  });

  it("sans l'option, /me part tel quel", async () => {
    const user = await ouvrir();
    await user.type(screen.getByRole("textbox", { name: "Écrire dans le chat du monde…" }), "/me salue{Enter}");
    expect(chat.send).toHaveBeenCalledWith("/me salue", null, { color: null, personaId: null, isAction: false });
  });

  it("**gras** et *italique* dans les messages ; aperçus sans les marques", async () => {
    optionsMock.value = { ...optionsMock.value, bubbles: true, actions: true };
    chat.messages = [
      msg("a", "u1", "alice", "un **gros** et un *petit* mot", "2026-11-09T10:00:00Z"),
      { ...msg("b", "u1", "alice", "chuchote *très* bas", "2026-11-09T10:01:00Z"), is_action: true },
      { ...msg("c", "u2", "bob", "**Oui**", "2026-11-09T10:02:00Z"), reply_to_id: "a", reply: { id: "a", user_id: "u1", username: "alice", content: "un **gros** mot" } },
    ];
    render(<WorldLiveChatDock />);
    // Barre : dernier message sans ses astérisques.
    expect(screen.getByTestId("world-live-chat-bar")).toHaveTextContent("Oui");
    expect(screen.getByTestId("world-live-chat-bar")).not.toHaveTextContent("**");
    await userEvent.setup().click(screen.getByTestId("world-live-chat-bar"));
    const bulle = screen.getAllByTestId("world-live-chat-bubble")[0];
    expect(bulle.querySelector("strong")).toHaveTextContent("gros");
    expect(bulle.querySelector("em")).toHaveTextContent("petit");
    expect(bulle).toHaveTextContent("un gros et un petit mot");
    // Dans une action, déjà en italique, l'italique ressort en romain.
    const action = screen.getByTestId("world-live-chat-action");
    expect(action.querySelector("em")).toHaveTextContent("très");
    expect(action).toHaveClass("[&_em]:not-italic");
    expect(screen.getByTestId("world-live-chat-quote")).toHaveTextContent("un gros mot");
  });

  it("une action s'affiche en italique, précédée du persona qui la joue", async () => {
    optionsMock.value = { ...optionsMock.value, personas: true, actions: true };
    chat.messages = [{ ...avecPersona(msg("a", "u1", "alice", "se rend à la porte.")), is_action: true }];
    await ouvrir();
    const action = screen.getByTestId("world-live-chat-action");
    expect(action).toHaveClass("italic");
    expect(action).toHaveTextContent(/^Lyra se rend à la porte\./);
  });

  it("une action et un en-tête se centrent pareil sur l'avatar, avec le même espacement", async () => {
    optionsMock.value = { ...optionsMock.value, actions: true };
    chat.messages = [
      { ...msg("a", "u1", "alice", "se lève."), is_action: true },
      msg("b", "u2", "bob", "salut", "2026-11-09T10:01:00Z"),
    ];
    await ouvrir();
    const row = (id: string) => screen.getByRole("log").querySelector<HTMLElement>(`[data-live-message='${id}']`)!;
    // 6 + 20 + 6 = 32 px, la hauteur de l'avatar : la première ligne d'un /me
    // et le pseudo d'un message tombent au même endroit.
    expect(screen.getByTestId("world-live-chat-action")).toHaveClass("py-1.5");
    expect(within(row("b")).getByTestId("world-live-chat-author").closest("div")).toHaveClass("pt-1.5");
    for (const id of ["a", "b"]) expect(row(id)).toHaveClass("mt-2", "py-0.5");
    expect(within(row("a")).getByTestId("world-live-chat-actions")).toHaveClass("top-1.5");
  });

  it("choisir un persona l'envoie avec sa couleur de dialogue, et le choix reste pour le monde", async () => {
    optionsMock.value = { ...optionsMock.value, personas: true, colors: true };
    const user = await ouvrir();
    await user.click(screen.getByRole("button", { name: "choisir Lyra" }));
    expect(screen.getByRole("button", { name: "Lyra" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Écrire dans le chat du monde…" }), "bonjour{Enter}");
    expect(chat.send).toHaveBeenCalledWith("bonjour", null, { color: "#f87171", personaId: "p1", isAction: false });
    expect(JSON.parse(localStorage.getItem("liveChat:persona:w1")!)).toMatchObject({ id: "p1", name: "Lyra" });
    // Retirer le persona : on écrit de nouveau en son nom propre.
    await user.click(screen.getByRole("button", { name: "Écrire sans persona" }));
    expect(localStorage.getItem("liveChat:persona:w1")).toBeNull();
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

  it("ne regroupe ni deux personas différents, ni une action (migration 241)", () => {
    const a = msg("a", "u1", "alice", "1", "2026-11-09T10:00:00Z");
    expect(isGrouped(a, { ...msg("b", "u1", "alice", "2", "2026-11-09T10:01:00Z"), persona_id: "p1" })).toBe(false);
    expect(isGrouped(a, { ...msg("c", "u1", "alice", "3", "2026-11-09T10:01:00Z"), is_action: true })).toBe(false);
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
      await waitFor(() => expect(chat.send).toHaveBeenCalledWith("Oui !", "m1", { color: null, personaId: null, isAction: false }));
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
