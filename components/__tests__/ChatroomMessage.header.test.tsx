import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessageWithPersona } from "@/types/db";

// ── Mocks ─────────────────────────────────────────────────────────────────────
// Reprend le set-up de ChatroomMessage.reactions.test.tsx : on garde
// UserProfileSheetTrigger réel (c'est ce qu'on teste), tout le reste est
// remplacé par des stubs minimalistes.

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encryptMessage: vi.fn(async (t: string) => t) }));

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ emoji_reactions: true }),
}));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => "offline" }),
}));
vi.mock("@/hooks/useLongPress", () => ({
  useLongPress: () => ({}),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

import ChatroomMessage from "@/components/chatrooms/message/ChatroomMessage";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<ChatMessageWithPersona> = {}): ChatMessageWithPersona {
  return {
    id: 1,
    chat_id: "chat-1",
    author_id: "user-other",
    content: "Bonjour !",
    created_at: "2024-01-01T10:00:00Z",
    persona: { id: "p1", user_id: "user-other", name: "Aria", avatar_url: null },
    author: { avatar_url: null, username: "Capou" },
    reactions: [],
    ...overrides,
  };
}

function setupMock(results: { data?: unknown; error?: unknown }[] = []) {
  const mock = createSupabaseMock({ user: { id: "viewer-1" }, results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ChatroomMessage — pseudo joueur cliquable", () => {
  let mock: ReturnType<typeof setupMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    mock = setupMock([{ data: null, error: null }]);
  });

  it("affiche le pseudo du joueur entre parenthèses", () => {
    render(<ChatroomMessage message={makeMessage()} online={{}} selfId="viewer-1" />);
    expect(screen.getByText("(@capou)")).toBeInTheDocument();
  });

  it("le pseudo est cliquable et déclenche le chargement du profil joueur", async () => {
    render(<ChatroomMessage message={makeMessage()} online={{}} selfId="viewer-1" />);

    const trigger = screen.getByText("(@capou)").closest("button");
    expect(trigger).not.toBeNull();

    fireEvent.click(trigger!);

    // Laisse le fetch mocké (setLoading/setProfile) se résoudre dans act()
    // avant la fin du test.
    await waitFor(() => expect(mock.from).toHaveBeenCalledWith("profiles"));
  });
});
