import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessageWithPersona } from "@/types/db";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ encryptMessage: vi.fn(async (t: string) => t) }));

vi.mock("@/components/providers/FeatureFlagsProvider", () => ({
  useFeatureFlags: () => ({ emoji_reactions: false }),
}));
vi.mock("@/components/providers/PresenceProvider", () => ({
  useGlobalPresence: () => ({ getUserPresence: () => null }),
  useUserPresence: () => null,
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

import ChatroomMessage from "@/components/chatrooms/message/ChatroomMessage";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<ChatMessageWithPersona> = {}): ChatMessageWithPersona {
  return {
    id: 1,
    chat_id: "chat-1",
    author_id: "user-other",
    content: "Attention, ça va secouer.",
    created_at: "2024-01-01T10:00:00Z",
    persona: { id: "p1", user_id: "user-other", name: "Aria", avatar_url: null },
    reactions: [],
    metadata: null,
    ...overrides,
  };
}

function setupMock(results: { data?: unknown; error?: unknown }[] = []) {
  const mock = createSupabaseMock({ user: { id: "viewer-1" }, results });
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  return mock;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ChatroomMessage — indicateur « modifié »", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMock();
  });

  it("affiche « modifié » quand metadata.edited_at est présent", () => {
    const message = makeMessage({ metadata: { edited_at: "2026-11-11T10:00:00Z" } });
    render(<ChatroomMessage message={message} online={{}} selfId="viewer-1" />);
    expect(screen.getByTestId("message-edited")).toHaveTextContent("edited");
  });

  it("n'affiche rien pour un message jamais modifié", () => {
    render(<ChatroomMessage message={makeMessage({ metadata: null })} online={{}} selfId="viewer-1" />);
    expect(screen.queryByTestId("message-edited")).toBeNull();
  });

  it("pose edited_at à la sauvegarde d'une édition", async () => {
    const onUpdated = vi.fn();
    const message = makeMessage({ author_id: "viewer-1", metadata: null });
    render(<ChatroomMessage message={message} online={{}} selfId="viewer-1" onUpdated={onUpdated} />);

    fireEvent.click(screen.getAllByText("edit")[0].closest("button")!);
    // Une retouche quelconque (ici un avertissement ajouté) : un texte
    // contentEditable ne se modifie pas de façon fiable sous jsdom.
    fireEvent.click(screen.getByText("contentWarning").closest("button")!);
    const tagInput = screen.getByTestId("content-warning-input");
    fireEvent.change(tagInput, { target: { value: "violence" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });
    fireEvent.keyDown(document.querySelector("[contenteditable]")!, { key: "Enter" });

    await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce());
    const [, , metadata] = onUpdated.mock.calls[0] as [number, string, { edited_at?: string } | null];
    expect(typeof metadata?.edited_at).toBe("string");
    expect(Number.isNaN(Date.parse(metadata!.edited_at!))).toBe(false);
  });
});
