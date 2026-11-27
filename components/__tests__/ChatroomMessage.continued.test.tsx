import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessageWithPersona } from "@/types/db";

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Les messages qui se suivent (même persona, même joueur) : la suite perd son
// en-tête, ou n'en garde qu'un petit avatar selon la préférence du lecteur ;
// ses actions et ses réactions restent. Set-up repris de
// ChatroomMessage.header.test.tsx.

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encryptMessage: vi.fn(async (t: string) => t) }));

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ emoji_reactions: true }),
}));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => "offline" }),
  useUserPresence: () => "offline",
}));
vi.mock("@/hooks/useLongPress", () => ({
  useLongPress: () => ({}),
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
  ChatroomMessageBubble: () => <div />,
}));
vi.mock("@/components/personas/PersonaProfileSheetTrigger", () => ({
  PersonaProfileSheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/chatrooms/reactions/ChatReactionPicker", () => ({
  ChatReactionPicker: () => <div data-testid="reaction-picker" />,
}));
vi.mock("@/components/chatrooms/reactions/ReactionEmoji", () => ({
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
// Drawer réel utilisé par UserProfileSheetTrigger (et PersonaProfileSheetTrigger) :
// on le remplace par un passthrough pour éviter les soucis de portail dans
// jsdom, tout en gardant le contenu monté (visible dans le DOM pour les
// assertions).
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  // MarkdownRenderer en tire la classe du bouton « Copier ».
  buttonVariants: () => "",
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

let headerMode: "subtle" | "hidden" = "subtle";
vi.mock("@/components/providers/CurrentUserProvider", () => ({
  useCurrentUser: () => ({ messageHeaderMode: headerMode, messageFont: "sans", messageTextSize: "base", messageTextAlign: "left" }),
}));

import ChatroomMessage from "@/components/chatrooms/message/ChatroomMessage";

function makeMessage(overrides: Partial<ChatMessageWithPersona> = {}): ChatMessageWithPersona {
  return {
    id: 1,
    chat_id: "chat-1",
    author_id: "user-me",
    content: "Bonjour !",
    created_at: "2024-01-01T10:00:00Z",
    persona: { id: "p1", user_id: "user-me", name: "Aria", avatar_url: null },
    author: { avatar_url: null, username: "Capou" },
    reactions: [],
    ...overrides,
  };
}

const renderMessage = (props: { continued?: boolean; joinsNext?: boolean; message?: ChatMessageWithPersona } = {}) =>
  render(
    <ChatroomMessage
      message={props.message ?? makeMessage()}
      online={{}}
      selfId="user-me"
      continued={props.continued}
      joinsNext={props.joinsNext}
    />,
  );

describe("ChatroomMessage — messages qui se suivent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headerMode = "subtle";
    vi.mocked(createClient).mockReturnValue(createSupabaseMock({ user: { id: "user-me" } }).client as never);
  });

  it("le premier message d'une série garde son en-tête", () => {
    renderMessage();
    expect(screen.getAllByText("Aria").length).toBeGreaterThan(0);
    expect(screen.getByTestId("avatar")).toBeInTheDocument();
  });

  it("en-tête masqué : la suite n'a ni nom, ni avatar, mais garde ses actions", () => {
    headerMode = "hidden";
    const { container } = renderMessage({ continued: true });
    // Le message lui-même : le tiroir mobile, rendu à côté, porte aussi le nom.
    expect(within(container.querySelector("article")!).queryAllByText("Aria")).toHaveLength(0);
    expect(screen.queryByTestId("avatar")).toBeNull();
    expect(screen.queryByTestId("message-subtle-avatar")).toBeNull();
    expect(screen.getByRole("button", { name: "actions" })).toBeInTheDocument();
  });

  it("en-tête subtil : la suite garde un petit avatar, nommé, sans le grand en-tête", () => {
    renderMessage({ continued: true });
    expect(screen.queryByTestId("avatar")).toBeNull();
    const pastille = screen.getByTestId("message-subtle-avatar");
    expect(pastille).toHaveAccessibleName("Aria");
    expect(screen.getByRole("button", { name: "actions" })).toBeInTheDocument();
  });

  it("les réactions de la suite restent affichées", () => {
    renderMessage({ continued: true, message: makeMessage({ reactions: [{ emoji: "heart", count: 2, me: false }] }) });
    expect(screen.getByRole("button", { name: "Réaction heart" })).toBeInTheDocument();
  });

  it("un message suivi de sa suite le signale, pour retirer le séparateur", () => {
    const { container } = renderMessage({ joinsNext: true });
    expect(container.querySelector("article")).toHaveAttribute("data-joins-next");
  });
});
