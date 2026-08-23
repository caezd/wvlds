import { describe, it, expect, vi } from "vitest";
import {
  matchesFreeText,
  matchesMention,
  matchesLink,
  hasActiveFilter,
  searchChatMessages,
} from "@/lib/chatSearch";

describe("hasActiveFilter", () => {
  it("est faux pour des filtres vides, y compris avec du texte libre", () => {
    expect(hasActiveFilter({})).toBe(false);
    expect(hasActiveFilter({ freeText: "salut" })).toBe(false);
  });

  it("est vrai dès qu'un filtre structuré est actif", () => {
    expect(hasActiveFilter({ chatIds: ["c1"] })).toBe(true);
    expect(hasActiveFilter({ authorIds: ["u1"] })).toBe(true);
    expect(hasActiveFilter({ personaIds: ["p1"] })).toBe(true);
    expect(hasActiveFilter({ mentionsUsername: "kael" })).toBe(true);
    expect(hasActiveFilter({ hasMedia: true })).toBe(true);
    expect(hasActiveFilter({ hasLink: true })).toBe(true);
    expect(hasActiveFilter({ pinned: false })).toBe(true);
    expect(hasActiveFilter({ dateFrom: "2026-01-01" })).toBe(true);
    expect(hasActiveFilter({ authorMode: "persona" })).toBe(true);
  });
});

describe("matchesFreeText", () => {
  it("est insensible à la casse", () => {
    expect(matchesFreeText("Bonjour tout le monde", "bonjour")).toBe(true);
  });

  it("est vrai pour une requête vide", () => {
    expect(matchesFreeText("peu importe", "")).toBe(true);
  });

  it("est faux si le texte est absent", () => {
    expect(matchesFreeText("Bonjour tout le monde", "au revoir")).toBe(false);
  });
});

describe("matchesMention", () => {
  it("détecte une mention exacte", () => {
    expect(matchesMention("salut @kael comment ça va", "kael")).toBe(true);
  });

  it("ne matche pas un pseudo qui n'est qu'un préfixe", () => {
    expect(matchesMention("salut @kaellyn", "kael")).toBe(false);
  });

  it("est insensible à la casse", () => {
    expect(matchesMention("salut @Kael", "kael")).toBe(true);
  });
});

describe("matchesLink", () => {
  it("détecte un lien http(s)", () => {
    expect(matchesLink("regarde ça : https://example.com/x")).toBe(true);
  });

  it("est faux sans lien", () => {
    expect(matchesLink("aucun lien ici")).toBe(false);
  });
});

type RawRow = {
  id: number;
  chat_id: string;
  author_id: string | null;
  persona_id: string | null;
  content: string;
  created_at: string;
  metadata: null;
  pinned: boolean;
};

function makeRow(id: number, content: string, chatId = "chat-1"): RawRow {
  return {
    id,
    chat_id: chatId,
    author_id: "author-1",
    persona_id: null,
    content,
    created_at: new Date(2026, 0, 1, 0, 0, id).toISOString(),
    metadata: null,
    pinned: false,
  };
}

function makeSupabase(rpcImpl: (...args: unknown[]) => Promise<{ data: unknown; error: null }>) {
  return {
    rpc: vi.fn(rpcImpl),
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [] }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("searchChatMessages — fast path (filtres seuls)", () => {
  it("renvoie directement la page de la RPC sans scan", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => makeRow(i + 1, `msg ${i}`));
    const supabase = makeSupabase(async () => ({ data: rows, error: null }));

    const page = await searchChatMessages(supabase, "world-1", { pinned: true }, null);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc.mock.calls[0][1]).toMatchObject({ p_world_id: "world-1", p_pinned: true, p_limit: 25 });
    expect(page.results).toHaveLength(25);
    expect(page.hasMore).toBe(true);
  });
});

describe("searchChatMessages — scan progressif (texte libre)", () => {
  it("s'arrête après un lot partiel (épuisé) et ne garde que les correspondances", async () => {
    const rows = [
      makeRow(101, "un message qui contient le mot clé", "chat-a"),
      makeRow(102, "rien à voir", "chat-a"),
      makeRow(103, "encore un mot clé ici", "chat-a"),
    ];
    const supabase = makeSupabase(async () => ({ data: rows, error: null }));

    const page = await searchChatMessages(supabase, "world-1", { freeText: "mot clé" }, null);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(page.results).toHaveLength(2);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("continue le balayage sur un second lot quand le premier est plein sans correspondance", async () => {
    const emptyBatch = Array.from({ length: 150 }, (_, i) => makeRow(200 + i, "rien d'intéressant", "chat-b"));
    const finalBatch = [
      makeRow(400, "trouvé : mot clé", "chat-b"),
      makeRow(401, "toujours rien", "chat-b"),
    ];
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: emptyBatch, error: null })
      .mockResolvedValueOnce({ data: finalBatch, error: null });
    const supabase = makeSupabase(rpc);

    const page = await searchChatMessages(supabase, "world-1", { freeText: "mot clé" }, null);

    expect(rpc).toHaveBeenCalledTimes(2);
    const secondCallParams = rpc.mock.calls[1][1] as { p_cursor_created_at: string; p_cursor_id: number };
    const lastOfFirstBatch = emptyBatch.at(-1)!;
    expect(secondCallParams.p_cursor_created_at).toBe(lastOfFirstBatch.created_at);
    expect(secondCallParams.p_cursor_id).toBe(lastOfFirstBatch.id);
    expect(page.results).toHaveLength(1);
    expect(page.results[0].id).toBe(400);
    expect(page.hasMore).toBe(false);
  });

  it("s'arrête dès que la page de résultats est complète, même en plein lot", async () => {
    const rows = Array.from({ length: 150 }, (_, i) =>
      makeRow(600 + i, i < 25 ? `mot clé ${i}` : "rien", "chat-c"),
    );
    const supabase = makeSupabase(async () => ({ data: rows, error: null }));

    const page = await searchChatMessages(supabase, "world-1", { freeText: "mot clé" }, null);

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(page.results).toHaveLength(25);
    // Le lot était plein (150) donc on ne sait pas encore si on a tout balayé.
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
  });
});
