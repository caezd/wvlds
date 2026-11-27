import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessageWithPersona } from "@/types/db";

// ── Mocks (repris de ChatroomMessage.sms.test.tsx) ─────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encryptMessage: vi.fn(async (t: string) => t) }));

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ emoji_reactions: true }),
}));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => null }),
  useUserPresence: () => null,
}));
// L'appui long arrive d'un coup : le toucher le déclenche aussitôt.
vi.mock("@/hooks/useLongPress", () => ({
  useLongPress: (onLongPress: () => void) => ({ onTouchStart: onLongPress }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  // La carte de monde sur le profil d'un membre (MemberWorldCardSection) lit la locale.
  useLocale: () => "fr",
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("@/components/avatars/AvatarWithFrame", () => ({
  AvatarWithFrame: () => <div data-testid="avatar" />,
}));
vi.mock("@/components/chatrooms/message/ChatroomMessageBubble", () => ({
  ChatroomMessageBubble: ({ message }: { message: { content: string } }) => <span>{message.content}</span>,
}));
vi.mock("@/components/personas/PersonaProfileSheetTrigger", () => ({
  PersonaProfileSheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/chatrooms/reactions/ChatReactionPicker", () => ({
  ChatReactionPicker: () => null,
}));
vi.mock("@/components/chatrooms/reactions/ReactionEmoji", () => ({
  ReactionEmoji: ({ value }: { value: string }) => <span>{value}</span>,
}));
vi.mock("@/components/chatrooms/blocks/GameBlockRenderer", () => ({
  GameBlockRenderer: () => <div data-testid="game-block">bloc</div>,
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
// Le tiroir ne s'affiche qu'ouvert : c'est ce qu'on vérifie.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
  DrawerClose: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button onClick={onClick}>{children}</button>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  // La barre de mise en forme de ParagraphBlockEditor en tire ses classes.
  buttonVariants: () => "",
}));

import ChatroomMessage from "@/components/chatrooms/message/ChatroomMessage";

function makeBlock(overrides: Partial<ChatMessageWithPersona> = {}): ChatMessageWithPersona {
  return {
    id: 7,
    chat_id: "chat-1",
    author_id: "viewer-1",
    content: '{"_type":"ellipse"}',
    created_at: "2024-01-01T10:00:00Z",
    persona: { id: "p1", user_id: "viewer-1", name: "Aria", avatar_url: null },
    reactions: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const mock = createSupabaseMock({ user: { id: "viewer-1" }, results: [] });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  // Un écran tactile : l'appui long est armé.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(pointer: coarse)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe("ChatroomMessage — appui long sur un bloc de jeu (mobile)", () => {
  it("ouvre le tiroir d'options du bloc : répondre, insérer avant, supprimer", async () => {
    render(
      <ChatroomMessage
        message={makeBlock()}
        online={{}}
        selfId="viewer-1"
        onReply={vi.fn()}
        onInsertBefore={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    fireEvent.touchStart(await screen.findByTestId("game-block"));

    expect(await screen.findByRole("button", { name: "reply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "insertBefore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "delete" })).toBeInTheDocument();
  });

  it("« Supprimer » demande la suppression du bloc, avec confirmation", async () => {
    const onRequestDelete = vi.fn();
    render(<ChatroomMessage message={makeBlock()} online={{}} selfId="viewer-1" onRequestDelete={onRequestDelete} />);

    fireEvent.touchStart(await screen.findByTestId("game-block"));
    fireEvent.click(await screen.findByRole("button", { name: "delete" }));

    expect(onRequestDelete).toHaveBeenCalledWith(7);
  });

  it("le bloc d'un autre se signale", async () => {
    const onReport = vi.fn();
    render(
      <ChatroomMessage
        message={makeBlock({ author_id: "other", persona: { id: "p2", user_id: "other", name: "Bran", avatar_url: null } })}
        online={{}}
        selfId="viewer-1"
        onReport={onReport}
      />,
    );

    fireEvent.touchStart(await screen.findByTestId("game-block"));
    fireEvent.click(await screen.findByRole("button", { name: "report" }));

    expect(onReport).toHaveBeenCalledWith(7);
  });
});
