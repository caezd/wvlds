import { describe, it, expect, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import {
  decorateMessagePage,
  fetchMessagePage,
  mergeResync,
  summarizeReactions,
  summarizeVotes,
} from "@/lib/chatMessagePage";

describe("fetchMessagePage — page d'historique", () => {
  it("borne la requête au plus ancien message affiché et rapporte les votes joints", async () => {
    const mock = createSupabaseMock({
      results: [{
        data: [
          { id: 8, chat_choice_votes: [{ option_id: "a", user_id: "me" }, { option_id: "b", user_id: "u2" }] },
          { id: 7, chat_message_reactions: [{ emoji: "👍", user_id: "u2" }] },
        ],
      }],
    });

    const page = await fetchMessagePage(mock.client as never, "c1", { before: "2026-01-01T00:00:00Z" });

    const b = mock.builders[0].builder;
    expect(b.eq).toHaveBeenCalledWith("chat_id", "c1");
    expect(b.lt).toHaveBeenCalledWith("created_at", "2026-01-01T00:00:00Z");
    expect(b.select.mock.calls[0][0]).toContain("chat_choice_votes(");
    expect(page.messages.map((m) => m.id)).toEqual([7, 8]);
    expect(page.voteRows).toEqual([
      { message_id: 8, option_id: "a", user_id: "me" },
      { message_id: 8, option_id: "b", user_id: "u2" },
    ]);
    expect(page.hasMore).toBe(false);
  });

  it("relecture : borne par `since` (gte) et taille de page choisie", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }] });
    await fetchMessagePage(mock.client as never, "c1", { since: "t0", limit: 100 });
    const b = mock.builders[0].builder;
    expect(b.gte).toHaveBeenCalledWith("created_at", "t0");
    expect(b.limit).toHaveBeenCalledWith(100);
  });

  it("sans `before`, ne borne pas la requête (première page)", async () => {
    const mock = createSupabaseMock({ results: [{ data: [] }] });
    await fetchMessagePage(mock.client as never, "c1");
    expect(mock.builders[0].builder.lt).not.toHaveBeenCalled();
  });

  it("repli en deux temps, votes compris, si la jointure est refusée", async () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});
    const mock = createSupabaseMock({
      results: [
        { data: null, error: { message: "relation" } },
        { data: [{ id: 2 }, { id: 1 }] },
        { data: [] },
        { data: [{ message_id: 1, option_id: "a", user_id: "u" }] },
        { data: [] },
      ],
    });
    const page = await fetchMessagePage(mock.client as never, "c1", { before: "t" });
    expect(mock.builders[1].builder.lt).toHaveBeenCalledWith("created_at", "t");
    expect(page.voteRows).toEqual([{ message_id: 1, option_id: "a", user_id: "u" }]);
    erreur.mockRestore();
  });
});

describe("agrégats", () => {
  it("summarizeReactions : compte par emoji, marque les siennes, trie", () => {
    const out = summarizeReactions(
      [
        { message_id: 1, emoji: "🔥", user_id: "u" },
        { message_id: 1, emoji: "👍", user_id: "me" },
        { message_id: 1, emoji: "👍", user_id: "u" },
      ],
      "me",
    );
    expect(out.get(1)).toEqual([
      { emoji: "👍", count: 2, me: true },
      { emoji: "🔥", count: 1, me: false },
    ]);
  });

  it("summarizeVotes : un résumé par message", () => {
    const out = summarizeVotes([{ message_id: 3, option_id: "a", user_id: "me" }], "me");
    expect(out.get(3)).toEqual([expect.objectContaining({ option_id: "a", count: 1 })]);
  });

  it("decorateMessagePage : votes et réactions attachés, liste vide par défaut", async () => {
    const out = await decorateMessagePage(
      [{ id: 1, content: "a" }, { id: 2, content: "b" }],
      { reactionRows: [], voteRows: [{ message_id: 2, option_id: "x", user_id: "me" }] },
      "me",
      null,
    );
    expect(out[0]).toMatchObject({ content: "a", reactions: [], votes: [] });
    expect(out[1].votes).toHaveLength(1);
  });
});

describe("mergeResync", () => {
  type M = { id: number; created_at: string; content: string };
  const m = (id: number, content = `v${id}`): M => ({ id, created_at: `2026-01-01T00:00:0${id}Z`, content });

  it("remplace les messages relus (édition) et retire ceux supprimés dans la fenêtre", () => {
    const out = mergeResync([m(1), m(2), m(3)], [m(1), m(3, "édité")], { windowStart: m(1).created_at, maxId: 3 });
    expect(out.map((x) => [x.id, x.content])).toEqual([[1, "v1"], [3, "édité"]]);
  });

  it("garde un message plus récent que la relecture (envoyé pendant qu'elle était en vol)", () => {
    const out = mergeResync([m(1), m(2), m(4)], [m(1), m(2)], { windowStart: m(1).created_at, maxId: 3 });
    expect(out.map((x) => x.id)).toEqual([1, 2, 4]);
  });

  it("ne retire rien hors de la fenêtre couverte (relecture tronquée)", () => {
    const out = mergeResync([m(1), m(2), m(3)], [m(3)], { windowStart: m(3).created_at, maxId: 3 });
    expect(out.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it("insère à sa place un message relu absent de l'affichage", () => {
    const out = mergeResync([m(1), m(3)], [m(1), m(2), m(3)], { windowStart: m(1).created_at, maxId: 3 });
    expect(out.map((x) => x.id)).toEqual([1, 2, 3]);
  });
});
