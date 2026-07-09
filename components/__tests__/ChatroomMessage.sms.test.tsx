import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessageWithPersona } from "@/types/db";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encryptMessage: vi.fn(async (t: string) => t) }));

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ emoji_reactions: true }),
}));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => null }),
}));
vi.mock("@/hooks/useLongPress", () => ({
  useLongPress: () => ({}),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("@/components/avatars/AvatarWithFrame", () => ({
  AvatarWithFrame: ({ size }: { size?: number }) => <div data-testid="avatar" data-size={size} />,
}));
vi.mock("@/components/chatrooms/ChatroomMessageBubble", () => ({
  ChatroomMessageBubble: ({ message }: { message: { content: string } }) => <span>{message.content}</span>,
}));
vi.mock("@/components/personas/PersonaProfileSheetTrigger", () => ({
  PersonaProfileSheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/chatrooms/ChatReactionPicker", () => ({
  ChatReactionPicker: () => null,
}));
vi.mock("@/components/chatrooms/ReactionEmoji", () => ({
  ReactionEmoji: ({ value }: { value: string }) => <span>{value}</span>,
}));
vi.mock("@/components/chatrooms/blocks/GameBlockRenderer", () => ({
  GameBlockRenderer: () => null,
}));
vi.mock("@/components/date-display", () => ({
  default: () => <span>date</span>,
}));
vi.mock("@/components/MarkdownRenderer", () => ({
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button onClick={onClick}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
}));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: ({ src }: { src?: string }) => <img src={src} alt="" />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));
// Le mock de @/components/ui/popover ci-dessus ignore `open` (rend toujours
// ses enfants) — sans ça, la barre de mise en forme (ParagraphBlockEditor)
// monterait HsvColorPicker qui dessine sur un <canvas>, non supporté par
// jsdom sans le paquet natif "canvas".
vi.mock("@/components/ui/hsv-color-picker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/hsv-color-picker")>();
  return { ...actual, HsvColorPicker: () => <div data-testid="hsv-color-picker-stub" /> };
});

import ChatroomMessage from "@/components/chatrooms/ChatroomMessage";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<ChatMessageWithPersona> = {}): ChatMessageWithPersona {
  return {
    id: 1,
    chat_id: "chat-1",
    author_id: "user-other",
    content: "Salut !",
    created_at: "2024-01-01T10:00:00Z",
    persona: { id: "p1", user_id: "user-other", name: "Aria", avatar_url: null },
    reactions: [],
    metadata: { sms: true },
    ...overrides,
  };
}

function setupMock(results: { data?: unknown; error?: unknown }[] = []) {
  const mock = createSupabaseMock({ user: { id: "viewer-1" }, results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ChatroomMessage — SMS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMock([{ data: null, error: null }]);
  });

  it("n'affiche pas le header (nom, date) quand metadata.sms est actif", () => {
    const message = makeMessage();
    render(<ChatroomMessage message={message} online={{}} selfId="viewer-1" />);

    expect(screen.queryByText("Aria")).toBeNull();
    expect(screen.queryByText("date")).toBeNull();
    expect(screen.getByText("Salut !")).toBeInTheDocument();
  });

  it("affiche le header normal quand metadata.sms est absent", () => {
    const message = makeMessage({ metadata: null });
    render(<ChatroomMessage message={message} online={{}} selfId="viewer-1" />);

    // "Aria" apparaît aussi dans le titre du drawer mobile (toujours monté) : on
    // vérifie juste qu'il y a au moins une occurrence dans le header.
    expect(screen.getAllByText("Aria").length).toBeGreaterThan(0);
    expect(screen.getByText("date")).toBeInTheDocument();
  });

  it("aligne la bulle à gauche pour un message d'un autre utilisateur (isolé : coins arrondis, avatar visible)", () => {
    const message = makeMessage({ author_id: "user-other" });
    const { container } = render(<ChatroomMessage message={message} online={{}} selfId="viewer-1" />);

    const row = container.querySelector('[data-message-id="1"]');
    expect(row?.className).toContain("justify-start");
    expect(row?.innerHTML).toContain("rounded-tl-xl");
    expect(row?.innerHTML).not.toContain("rounded-tl-[3px]");
    expect(screen.getByTestId("avatar")).toBeInTheDocument();
  });

  it("aligne la bulle à droite et affiche éditer/supprimer pour son propre message", () => {
    const message = makeMessage({ author_id: "viewer-1" });
    const { container } = render(<ChatroomMessage message={message} online={{}} selfId="viewer-1" />);

    const row = container.querySelector('[data-message-id="1"]');
    expect(row?.className).toContain("justify-end");
    expect(row?.innerHTML).toContain("rounded-tr-xl");
    expect(screen.getByLabelText("Modifier")).toBeInTheDocument();
    expect(screen.getByLabelText("Supprimer")).toBeInTheDocument();
  });

  it("resserre les coins de raccord et masque l'avatar quand smsSharpTop/Bottom/ShowAvatar sont fournis (série du même auteur)", () => {
    const message = makeMessage({ author_id: "viewer-1" });
    const { container } = render(
      <ChatroomMessage
        message={message}
        online={{}}
        selfId="viewer-1"
        smsSharpTop
        smsSharpBottom
        smsShowAvatar={false}
      />,
    );

    const row = container.querySelector('[data-message-id="1"]');
    expect(row?.innerHTML).toContain("rounded-tr-[3px]");
    expect(row?.innerHTML).toContain("rounded-br-[3px]");
    expect(screen.queryByTestId("avatar")).toBeNull();
  });

  it("ne montre pas éditer/supprimer sur le message d'un autre utilisateur", () => {
    const message = makeMessage({ author_id: "user-other" });
    render(<ChatroomMessage message={message} online={{}} selfId="viewer-1" />);

    expect(screen.queryByLabelText("Modifier")).toBeNull();
    expect(screen.queryByLabelText("Supprimer")).toBeNull();
  });

  it("passer en édition puis décocher SMS fait revenir au rendu normal après sauvegarde", async () => {
    const onUpdated = vi.fn();
    const message = makeMessage({ author_id: "viewer-1", content: "Salut !" });
    render(
      <ChatroomMessage
        message={message}
        online={{}}
        selfId="viewer-1"
        onUpdated={onUpdated}
      />,
    );

    fireEvent.click(screen.getByLabelText("Modifier"));

    // Le toggle "SMS" est coché initialement (miroir de metadata.sms)
    const smsToggle = screen.getByText("smsMode").closest("button");
    expect(smsToggle).not.toBeNull();
    fireEvent.click(smsToggle!);

    const editor = document.querySelector("[contenteditable]")!;
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce());
    const [id, content, metadata] = onUpdated.mock.calls[0] as [number, string, { sms?: boolean } | null];
    expect(id).toBe(1);
    expect(content).toBe("Salut !");
    expect(metadata?.sms).toBeUndefined();
  });
});
