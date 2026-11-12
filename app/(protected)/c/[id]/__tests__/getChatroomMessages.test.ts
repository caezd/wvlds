import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, type QueryResult } from "@/test/supabaseMock";
import { CHAT_MESSAGES_PAGE_SIZE } from "@/lib/constants";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getChatroomMessages } from "../getChatroomMessages";

function setup(results: QueryResult[]) {
  const mock = createSupabaseMock({ results });
  vi.mocked(createClient).mockResolvedValue(mock.client as never);
  return mock;
}

beforeEach(() => vi.clearAllMocks());

describe("getChatroomMessages", () => {
  it("lit réactions, votes et badges joints aux messages, en une seule vague", async () => {
    const mock = setup([
      // Messages, ordre décroissant, avec leurs tableaux joints.
      {
        data: [
          {
            id: 2,
            content: "b",
            chat_message_reactions: [{ emoji: "👍", user_id: "u1" }],
            chat_choice_votes: [],
            challenge_attempts: [{ status: "won", challenge: { title: "Défi", description: null } }],
          },
          {
            id: 1,
            content: "a",
            chat_message_reactions: [],
            chat_choice_votes: [{ option_id: "o1", user_id: "u2" }],
            challenge_attempts: [],
          },
        ],
      },
      { data: { key_b64: "k" } },
      { data: { persona: { id: "p1" } } },
    ]);

    const res = await getChatroomMessages("c1", "me");

    // Trois requêtes seulement : messages, clé, persona — plus de seconde vague.
    expect(mock.builders.map((b) => b.table)).toEqual(["chat_messages", "chatroom_keys", "chatroom_persona_prefs"]);
    expect(mock.builders[0].builder.select.mock.calls[0][0]).toContain("chat_message_reactions(");
    // Ordre croissant, tableaux joints retirés des messages.
    expect(res.messages.map((m) => m.id)).toEqual([1, 2]);
    expect(res.messages[0]).not.toHaveProperty("chat_message_reactions");
    expect(res.reactionRows).toEqual([{ message_id: 2, emoji: "👍", user_id: "u1" }]);
    expect(res.voteRows).toEqual([{ message_id: 1, option_id: "o1", user_id: "u2" }]);
    expect(res.challengeBadges).toEqual([[2, { title: "Défi", description: null }]]);
    expect(res.chatroomKey).toBe("k");
    expect(res.initialPersona).toEqual({ id: "p1" });
    expect(res.hasMore).toBe(false);
  });

  it("signale un historique plus ancien quand la page est pleine", async () => {
    const page = Array.from({ length: CHAT_MESSAGES_PAGE_SIZE }, (_, i) => ({ id: i + 1 }));
    setup([{ data: page }, { data: null }, { data: null }]);
    const res = await getChatroomMessages("c1", "me");
    expect(res.hasMore).toBe(true);
  });

  it("retombe sur le chargement en deux temps si la jointure est refusée", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const mock = setup([
      { data: null, error: { message: "Could not find a relationship" } },
      { data: null },
      { data: null },
      { data: [{ id: 2 }, { id: 1 }] },
      { data: [{ message_id: 1, emoji: "🔥", user_id: "u1" }] },
      { data: [] },
      { data: [{ message_id: 2, challenge: { title: "D", description: "x" } }] },
    ]);

    const res = await getChatroomMessages("c1", "me");

    expect(erreur).toHaveBeenCalled();
    expect(mock.builders[3].builder.select.mock.calls[0][0]).not.toContain("chat_message_reactions(");
    expect(res.messages.map((m) => m.id)).toEqual([1, 2]);
    expect(res.reactionRows).toEqual([{ message_id: 1, emoji: "🔥", user_id: "u1" }]);
    expect(res.challengeBadges).toEqual([[2, { title: "D", description: "x" }]]);
    erreur.mockRestore();
  });
});
