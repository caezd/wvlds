import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
vi.mock("@/components/ui/hsv-color-picker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/hsv-color-picker")>();
  return { ...actual, HsvColorPicker: () => <div data-testid="hsv-color-picker-stub" /> };
});

import ChatroomMessage from "@/components/chatrooms/message/ChatroomMessage";

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<ChatMessageWithPersona> = {}): ChatMessageWithPersona {
  return {
    id: 1,
    chat_id: "chat-1",
    author_id: "viewer-1",
    content: "Salut !",
    created_at: "2024-01-01T10:00:00Z",
    persona: { id: "p1", user_id: "viewer-1", name: "Aria", avatar_url: null },
    reactions: [],
    ...overrides,
  };
}

function setupMock(results: { data?: unknown; error?: unknown }[] = []) {
  const mock = createSupabaseMock({ user: { id: "viewer-1" }, results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

/** Simule un point de contact grossier (mobile/tactile), cf. `isMobile` dans ChatroomMessage. */
function mockCoarsePointer(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(pointer: coarse)" ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMock([{ data: null, error: null }]);
});

describe("ChatroomMessage — annuler/enregistrer en édition, desktop vs mobile", () => {
  // `forceEdit` déclenche l'édition directement (via useChatroomMessageEdit),
  // sans dépendre du déclencheur normal (dropdown desktop "Modifier", masqué
  // sur mobile où l'édition démarre par long-press — cf. useLongPress mocké
  // ici, donc non simulable telle quelle).
  it("desktop : annuler/enregistrer restent dans l'en-tête du message (pas de barre sticky)", async () => {
    mockCoarsePointer(false);
    render(<ChatroomMessage message={makeMessage()} online={{}} selfId="viewer-1" forceEdit />);

    expect(await screen.findAllByLabelText("cancelEdit")).toHaveLength(1);
    expect(screen.getAllByLabelText("saveEdit")).toHaveLength(1);
  });

  it("mobile : annuler/enregistrer passent dans la barre sticky du composer d'édition, retirés de l'en-tête", async () => {
    mockCoarsePointer(true);
    const { container } = render(<ChatroomMessage message={makeMessage()} online={{}} selfId="viewer-1" forceEdit />);

    // Un seul jeu de boutons au total (pas de duplication en-tête + sticky).
    expect(await screen.findAllByLabelText("cancelEdit")).toHaveLength(1);
    expect(screen.getAllByLabelText("saveEdit")).toHaveLength(1);

    // Ils vivent dans la barre sticky du composer, pas dans l'en-tête du message.
    const cancelButton = screen.getByLabelText("cancelEdit");
    expect(cancelButton.closest(".sticky")).not.toBeNull();
    expect(container.querySelector(".sticky")?.contains(cancelButton)).toBe(true);
  });
});
