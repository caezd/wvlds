import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createSupabaseMock } from "@/test/supabaseMock";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { useRealtimeChatSync } from "@/hooks/useRealtimeChatSync";
import { createClient } from "@/lib/supabase/client";

function setup(opts: Parameters<typeof createSupabaseMock>[0] = {}, props: Partial<Parameters<typeof useRealtimeChatSync>[0]> = {}) {
  const mock = createSupabaseMock(opts);
  vi.mocked(createClient).mockReturnValue(mock.client as never);
  const cbs = {
    onMessageInserted: vi.fn(),
    onMessageUpdated: vi.fn(),
    onMessageDeleted: vi.fn(),
    onChatroomPatched: vi.fn(),
    onReactionChange: vi.fn(),
  };
  renderHook(() =>
    useRealtimeChatSync({ chatId: "c1", selfId: "me", initialLatestId: 3, ...cbs, ...props }),
  );
  return { mock, cbs };
}

const insert = (h: { config: Record<string, unknown> }) => h.config.event === "INSERT";

beforeEach(() => vi.clearAllMocks());

describe("useRealtimeChatSync", () => {
  it("ignore un INSERT déjà connu (id <= initialLatestId)", async () => {
    const { mock, cbs } = setup();
    await act(async () => {
      mock.channelNamed("chat-c1")!.emit(insert, { new: { id: 2 } });
    });
    expect(cbs.onMessageInserted).not.toHaveBeenCalled();
  });

  it("récupère et propage un INSERT plus récent", async () => {
    const { mock, cbs } = setup({
      results: [{ data: { id: 5, content: "salut", author_id: "a2" } }],
    });
    await act(async () => {
      mock.channelNamed("chat-c1")!.emit(insert, { new: { id: 5 } });
    });
    await waitFor(() => expect(cbs.onMessageInserted).toHaveBeenCalled());
    expect(cbs.onMessageInserted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5 }),
      "a2",
    );
  });

  it("propage une suppression de message", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chat-c1-delete")!.emit(() => true, { old: { id: 7 } });
    });
    expect(cbs.onMessageDeleted).toHaveBeenCalledWith(7);
  });

  it("propage une édition de contenu", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chat-messages-updates-c1")!.emit(() => true, {
        new: { id: 9, content: "édité" },
      });
    });
    expect(cbs.onMessageUpdated).toHaveBeenCalledWith(9, "édité", null);
  });

  it("propage la metadata mise à jour (ex. texto/bubbles décoché)", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chat-messages-updates-c1")!.emit(() => true, {
        new: { id: 9, content: "édité", metadata: { texto: true } },
      });
    });
    expect(cbs.onMessageUpdated).toHaveBeenCalledWith(9, "édité", { texto: true });
  });

  it("propage un patch de chatroom (titre/bannière)", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chatroom-updates-c1")!.emit(() => true, {
        new: { title: "Nouveau titre" },
      });
    });
    expect(cbs.onChatroomPatched).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Nouveau titre" }),
    );
  });

  it("applique une réaction d'un autre utilisateur (delta +1)", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chat-reactions-c1")!.emit(() => true, {
        eventType: "INSERT",
        new: { message_id: 1, emoji: "👍", user_id: "autre" },
      });
    });
    expect(cbs.onReactionChange).toHaveBeenCalledWith(1, "👍", 1);
  });

  it("ignore sa propre réaction (évite le double comptage)", async () => {
    const { mock, cbs } = setup();
    act(() => {
      mock.channelNamed("chat-reactions-c1")!.emit(() => true, {
        eventType: "INSERT",
        new: { message_id: 1, emoji: "👍", user_id: "me" },
      });
    });
    expect(cbs.onReactionChange).not.toHaveBeenCalled();
  });
});
