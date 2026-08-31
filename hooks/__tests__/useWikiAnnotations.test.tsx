import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import { createSupabaseMock } from "@/test/supabaseMock";
import { groupIntoThreads, useWikiAnnotations } from "@/hooks/useWikiAnnotations";
import type { WikiAnnotation } from "@/types/worlds";

function annotation(over: Partial<WikiAnnotation> & { id: string }): WikiAnnotation {
  return {
    page_id: "p1",
    parent_id: null,
    author_id: "u1",
    body: "Un commentaire",
    anchor_block_type: "p",
    anchor_quote: "Les Gardiens",
    anchor_prefix: "",
    anchor_suffix: "",
    anchor_start: 0,
    resolved_at: null,
    resolved_by: null,
    created_at: "2026-08-01T10:00:00.000Z",
    author: { id: "u1", username: "caedrik", avatar_url: null },
    ...over,
  };
}

describe("groupIntoThreads", () => {
  it("rattache chaque réponse à sa racine", () => {
    const threads = groupIntoThreads([
      annotation({ id: "a1" }),
      annotation({ id: "r1", parent_id: "a1", anchor_quote: null, anchor_start: null }),
      annotation({ id: "a2" }),
    ]);

    expect(threads.map(t => t.root.id)).toEqual(["a1", "a2"]);
    expect(threads[0].replies.map(r => r.id)).toEqual(["r1"]);
    expect(threads[1].replies).toEqual([]);
  });

  it("range les réponses dans leur ordre de publication", () => {
    const threads = groupIntoThreads([
      annotation({ id: "a1" }),
      annotation({ id: "tard", parent_id: "a1", created_at: "2026-08-03T10:00:00.000Z", anchor_quote: null, anchor_start: null }),
      annotation({ id: "tot", parent_id: "a1", created_at: "2026-08-02T10:00:00.000Z", anchor_quote: null, anchor_start: null }),
    ]);
    expect(threads[0].replies.map(r => r.id)).toEqual(["tot", "tard"]);
  });

  it("ignore une réponse dont la racine est absente plutôt que d'en faire un fil", () => {
    // Une réponse promue en fil s'afficherait sans ancre : impossible de
    // savoir à quoi elle répond.
    const threads = groupIntoThreads([
      annotation({ id: "orpheline", parent_id: "disparue", anchor_quote: null, anchor_start: null }),
    ]);
    expect(threads).toEqual([]);
  });
});

describe("useWikiAnnotations", () => {
  const params = { pageId: "p1", worldId: "w1", userId: "u1" };

  it("ne lit rien tant que le panneau n'a pas été ouvert", () => {
    const mock = createSupabaseMock({ results: [] });
    renderHook(() => useWikiAnnotations({ ...params, supabase: mock.client as never, enabled: false }));
    expect(mock.client.from).not.toHaveBeenCalled();
  });

  it("charge les annotations de la page à l'ouverture", async () => {
    const mock = createSupabaseMock({
      results: [{ data: [annotation({ id: "a1", body: "Question" })], error: null }],
    });
    const { result } = renderHook(() =>
      useWikiAnnotations({ ...params, supabase: mock.client as never, enabled: true }),
    );

    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.threads[0].root.body).toBe("Question");
    expect(mock.client.from).toHaveBeenCalledWith("world_wiki_page_annotations");
  });

  it("écrit l'ancre, le monde et l'auteur en créant un fil", async () => {
    const created = annotation({ id: "neuf", body: "Qui les a créés ?" });
    const mock = createSupabaseMock({
      results: [{ data: [], error: null }, { data: created, error: null }],
    });
    const { result } = renderHook(() =>
      useWikiAnnotations({ ...params, supabase: mock.client as never, enabled: true }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createThread({
        anchor: { type: "p", quote: "Les Gardiens", prefix: "avant ", suffix: " après", index: 2 },
        body: "  Qui les a créés ?  ",
      });
    });

    const inserted = mock.builders[1].builder.insert.mock.calls[0][0];
    expect(inserted).toMatchObject({
      page_id: "p1",
      world_id: "w1",
      author_id: "u1",
      parent_id: null,
      body: "Qui les a créés ?",
      anchor_block_type: "p",
      anchor_quote: "Les Gardiens",
      anchor_prefix: "avant ",
      anchor_suffix: " après",
      // `anchor_start` porte l'index du bloc depuis la migration 142 : la
      // colonne est la même, l'unité a changé.
      anchor_start: 2,
    });
    // La ligne rendue par la base rejoint l'état sans attendre le temps réel.
    expect(result.current.threads.map(t => t.root.id)).toContain("neuf");
  });

  it("publie une réponse de la même nature que sa racine, et sans ancre", async () => {
    const root = annotation({ id: "a1" });
    const mock = createSupabaseMock({
      results: [{ data: [root], error: null }, { data: annotation({ id: "r1", parent_id: "a1" }), error: null }],
    });
    const { result } = renderHook(() =>
      useWikiAnnotations({ ...params, supabase: mock.client as never, enabled: true }),
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => { await result.current.reply(root, "D'accord."); });

    expect(mock.builders[1].builder.insert.mock.calls[0][0]).toMatchObject({
      parent_id: "a1",
      body: "D'accord.",
    });
    expect(mock.builders[1].builder.insert.mock.calls[0][0]).not.toHaveProperty("anchor_quote");
  });

  it("horodate et signe la résolution d'un fil", async () => {
    const root = annotation({ id: "a1" });
    const mock = createSupabaseMock({
      results: [{ data: [root], error: null }, { data: { ...root, resolved_at: "x", resolved_by: "u1" }, error: null }],
    });
    const { result } = renderHook(() =>
      useWikiAnnotations({ ...params, supabase: mock.client as never, enabled: true }),
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => { await result.current.setResolved(root, true); });

    const patch = mock.builders[1].builder.update.mock.calls[0][0];
    expect(patch.resolved_by).toBe("u1");
    expect(typeof patch.resolved_at).toBe("string");
  });

  it("efface la résolution à la réouverture", async () => {
    const root = annotation({ id: "a1", resolved_at: "2026-08-02T10:00:00.000Z", resolved_by: "u1" });
    const mock = createSupabaseMock({
      results: [{ data: [root], error: null }, { data: { ...root, resolved_at: null, resolved_by: null }, error: null }],
    });
    const { result } = renderHook(() =>
      useWikiAnnotations({ ...params, supabase: mock.client as never, enabled: true }),
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    await act(async () => { await result.current.setResolved(root, false); });

    expect(mock.builders[1].builder.update.mock.calls[0][0]).toEqual({ resolved_at: null, resolved_by: null });
  });

  it("retire aussi les réponses quand le fil est supprimé", async () => {
    const root = annotation({ id: "a1" });
    const reply = annotation({ id: "r1", parent_id: "a1", anchor_quote: null, anchor_start: null });
    const mock = createSupabaseMock({
      results: [{ data: [root, reply], error: null }, { data: null, error: null }],
    });
    const { result } = renderHook(() =>
      useWikiAnnotations({ ...params, supabase: mock.client as never, enabled: true }),
    );
    await waitFor(() => expect(result.current.annotations).toHaveLength(2));

    await act(async () => { await result.current.remove(root); });

    // Le CASCADE de la base emporte la réponse ; l'état local doit suivre,
    // sinon elle reste seule à l'écran jusqu'au prochain chargement.
    expect(result.current.annotations).toEqual([]);
  });

  it("se réabonne aux changements de la page", async () => {
    const mock = createSupabaseMock({ results: [{ data: [], error: null }] });
    renderHook(() => useWikiAnnotations({ ...params, supabase: mock.client as never, enabled: true }));

    await waitFor(() => expect(mock.channels.length).toBe(1));
    expect(mock.channels[0].name).toBe("wiki_annotations:p1");
    expect(mock.channels[0].handlers[0].config).toMatchObject({
      table: "world_wiki_page_annotations",
      filter: "page_id=eq.p1",
    });
  });

  it("n'écrit rien sans utilisateur identifié", async () => {
    const mock = createSupabaseMock({ results: [{ data: [], error: null }] });
    const { result } = renderHook(() =>
      useWikiAnnotations({ ...params, userId: null, supabase: mock.client as never, enabled: true }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const created = await result.current.createThread({
        anchor: { type: "p", quote: "Les Gardiens", prefix: "", suffix: "", index: 0 },
        body: "Tentative",
      });
      expect(created).toBeNull();
    });
    expect(mock.client.from).toHaveBeenCalledTimes(1); // le chargement seul
  });
});
