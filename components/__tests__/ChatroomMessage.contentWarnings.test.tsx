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
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

import ChatroomMessage from "@/components/chatrooms/ChatroomMessage";

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

describe("ChatroomMessage — avertissements de contenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMock([{ data: null, error: null }]);
  });

  it("affiche les étiquettes d'avertissement quand metadata.content_warnings est présent", () => {
    const message = makeMessage({ metadata: { content_warnings: ["violence", "deuil"] } });
    render(<ChatroomMessage message={message} online={{}} selfId="viewer-1" />);

    expect(screen.getByText("contentWarningPrefix")).toBeInTheDocument();
    expect(screen.getByText("violence")).toBeInTheDocument();
    expect(screen.getByText("deuil")).toBeInTheDocument();
  });

  it("n'affiche rien quand metadata.content_warnings est absent", () => {
    const message = makeMessage({ metadata: null });
    render(<ChatroomMessage message={message} online={{}} selfId="viewer-1" />);

    expect(screen.queryByText("contentWarningPrefix")).toBeNull();
  });

  it("n'affiche rien quand metadata.content_warnings est un tableau vide", () => {
    const message = makeMessage({ metadata: { content_warnings: [] } });
    render(<ChatroomMessage message={message} online={{}} selfId="viewer-1" />);

    expect(screen.queryByText("contentWarningPrefix")).toBeNull();
  });

  it("n'affiche pas son propre bandeau pour un message SMS : agrégé une fois par bloc par la vue parente", () => {
    const message = makeMessage({ metadata: { sms: true, content_warnings: ["deuil"] } });
    const { container } = render(<ChatroomMessage message={message} online={{}} selfId="viewer-1" />);

    expect(screen.queryByText("contentWarningPrefix")).toBeNull();
    const bubbles = container.querySelectorAll('[data-message-id="1"]');
    expect(bubbles.length).toBe(1);
    expect(bubbles[0].className).toContain("justify-start");
  });

  it("permet d'ajouter un avertissement en édition et le persiste à la sauvegarde", async () => {
    const onUpdated = vi.fn();
    const message = makeMessage({ author_id: "viewer-1", metadata: null });
    render(
      <ChatroomMessage
        message={message}
        online={{}}
        selfId="viewer-1"
        onUpdated={onUpdated}
      />,
    );

    // Pour un message hors mode SMS, "Modifier" apparaît deux fois (menu
    // d'actions + tiroir mobile, toujours monté dans ces tests) : on prend le
    // premier, celui du menu d'actions.
    fireEvent.click(screen.getAllByText("Modifier")[0].closest("button")!);

    const toggle = screen.getByText("contentWarning").closest("button");
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle!);

    const tagInput = screen.getByTestId("content-warning-input");
    fireEvent.change(tagInput, { target: { value: "violence" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });

    // Le message a aussi un champ texte (la zone d'édition principale) :
    // on cible spécifiquement le <textarea>, pas l'input de tag ci-dessus.
    const textarea = screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA")!;
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce());
    const [, , metadata] = onUpdated.mock.calls[0] as [number, string, { content_warnings?: string[] } | null];
    expect(metadata?.content_warnings).toEqual(["violence"]);
  });

  it("retire un avertissement existant en édition quand on désactive la section", async () => {
    const onUpdated = vi.fn();
    const message = makeMessage({ author_id: "viewer-1", metadata: { content_warnings: ["violence"] } });
    render(
      <ChatroomMessage
        message={message}
        online={{}}
        selfId="viewer-1"
        onUpdated={onUpdated}
      />,
    );

    // Pour un message hors mode SMS, "Modifier" apparaît deux fois (menu
    // d'actions + tiroir mobile, toujours monté dans ces tests) : on prend le
    // premier, celui du menu d'actions.
    fireEvent.click(screen.getAllByText("Modifier")[0].closest("button")!);

    // Le toggle reflète l'état existant : la section est déjà active.
    expect(screen.getByTestId("content-warning-input")).toBeInTheDocument();
    const toggle = screen.getByText("contentWarning").closest("button");
    fireEvent.click(toggle!);

    const textarea = screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA")!;
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce());
    const [, , metadata] = onUpdated.mock.calls[0] as [number, string, { content_warnings?: string[] } | null];
    expect(metadata?.content_warnings).toBeUndefined();
  });

  it("expose un nom accessible au bouton de désactivation des avertissements", () => {
    const message = makeMessage({ author_id: "viewer-1", metadata: { content_warnings: ["violence"] } });
    render(
      <ChatroomMessage
        message={message}
        online={{}}
        selfId="viewer-1"
      />,
    );

    fireEvent.click(screen.getAllByText("Modifier")[0].closest("button")!);

    expect(screen.getByRole("button", { name: "disableContentWarning" })).toBeInTheDocument();
  });
});
