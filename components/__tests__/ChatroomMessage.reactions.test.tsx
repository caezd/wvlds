import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
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

// Composants lourds remplacés par des stubs minimalistes
vi.mock("@/components/avatars/AvatarWithFrame", () => ({
  AvatarWithFrame: () => <div data-testid="avatar" />,
}));
vi.mock("@/components/chatrooms/message/ChatroomMessageBubble", () => ({
  ChatroomMessageBubble: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/personas/PersonaProfileSheetTrigger", () => ({
  PersonaProfileSheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/chatrooms/reactions/ChatReactionPicker", () => ({
  ChatReactionPicker: ({ onSelect }: { onSelect: (e: string) => void }) => (
    <button data-testid="reaction-picker" onClick={() => onSelect("heart")}>
      picker
    </button>
  ),
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

// Composants UI
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

describe("ChatroomMessage — réactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMock([{ data: null, error: null }]);
  });

  describe("pills de réactions existantes", () => {
    it("affiche les réactions existantes", () => {
      const message = makeMessage({
        reactions: [{ emoji: "heart", count: 3, me: false }],
      });

      render(
        <ChatroomMessage
          message={message}
          online={{}}
          selfId="viewer-1"
        />,
      );

      expect(screen.getByText("heart")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("appelle onReactionsUpdated (update optimiste) au clic sur un pill", () => {
      const onReactionsUpdated = vi.fn();
      const message = makeMessage({
        reactions: [{ emoji: "heart", count: 3, me: false }],
      });

      render(
        <ChatroomMessage
          message={message}
          online={{}}
          selfId="viewer-1"
          onReactionsUpdated={onReactionsUpdated}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Réaction heart/i }));

      // update optimiste immédiat
      expect(onReactionsUpdated).toHaveBeenCalledOnce();
      const [id, reactions] = onReactionsUpdated.mock.calls[0] as [number, { emoji: string; count: number; me: boolean }[]];
      expect(id).toBe(1);
      expect(reactions).toEqual(expect.arrayContaining([
        expect.objectContaining({ emoji: "heart", count: 4, me: true }),
      ]));
    });

    it("retire la réaction si elle appartient déjà à l'utilisateur", () => {
      const onReactionsUpdated = vi.fn();
      const message = makeMessage({
        reactions: [{ emoji: "heart", count: 1, me: true }],
      });

      render(
        <ChatroomMessage
          message={message}
          online={{}}
          selfId="viewer-1"
          onReactionsUpdated={onReactionsUpdated}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Réaction heart/i }));

      expect(onReactionsUpdated).toHaveBeenCalledOnce();
      const [, reactions] = onReactionsUpdated.mock.calls[0] as [number, { emoji: string }[]];
      // count tombe à 0 → la réaction disparaît de la liste
      expect(reactions.find((r) => r.emoji === "heart")).toBeUndefined();
    });

    it("annule la mise à jour optimiste et affiche une erreur si l'insertion échoue (ex: rejet RLS)", async () => {
      const onReactionsUpdated = vi.fn();
      const initialReactions = [{ emoji: "heart", count: 3, me: false }];
      setupMock([
        { data: null, error: { message: "new row violates row-level security policy" } },
      ]);
      const message = makeMessage({ reactions: initialReactions });

      render(
        <ChatroomMessage
          message={message}
          online={{}}
          selfId="viewer-1"
          onReactionsUpdated={onReactionsUpdated}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Réaction heart/i }));

      // 1er appel : update optimiste. 2e appel : rollback après l'échec de l'INSERT.
      await waitFor(() => expect(onReactionsUpdated).toHaveBeenCalledTimes(2));

      const [id, reverted] = onReactionsUpdated.mock.calls[1] as [number, typeof initialReactions];
      expect(id).toBe(1);
      expect(reverted).toEqual(initialReactions);
      expect(toast.error).toHaveBeenCalled();
    });

    it("n'affiche pas de pills si aucune réaction", () => {
      const message = makeMessage({ reactions: [] });

      render(
        <ChatroomMessage
          message={message}
          online={{}}
          selfId="viewer-1"
        />,
      );

      expect(screen.queryByRole("button", { name: /Réaction/i })).toBeNull();
    });
  });

  describe("bouton d'ajout de réaction (+😊)", () => {
    it("est présent dans le DOM (desktop)", () => {
      const message = makeMessage();

      render(
        <ChatroomMessage
          message={message}
          online={{}}
          selfId="viewer-1"
        />,
      );

      expect(screen.getByTitle("addReaction")).toBeInTheDocument();
    });

    it("sélectionner une réaction via le picker appelle onReactionsUpdated", () => {
      const onReactionsUpdated = vi.fn();
      const message = makeMessage({ reactions: [] });

      render(
        <ChatroomMessage
          message={message}
          online={{}}
          selfId="viewer-1"
          onReactionsUpdated={onReactionsUpdated}
        />,
      );

      fireEvent.click(screen.getAllByTestId("reaction-picker")[0]);

      expect(onReactionsUpdated).toHaveBeenCalledOnce();
      const [id, reactions] = onReactionsUpdated.mock.calls[0] as [number, { emoji: string }[]];
      expect(id).toBe(1);
      expect(reactions[0].emoji).toBe("heart");
    });
  });
});
