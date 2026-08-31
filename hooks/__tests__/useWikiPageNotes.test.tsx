import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

import { createSupabaseMock } from "@/test/supabaseMock";
import {
  groupNotesByCategory,
  planNoteMove,
  useWikiPageNotes,
} from "@/hooks/useWikiPageNotes";
import type { WikiNoteCategory, WikiPageNote } from "@/types/worlds";

function cat(id: string, sort_index: number, name = id): WikiNoteCategory {
  return { id, page_id: "p1", name, sort_index };
}

function note(id: string, category_id: string, sort_index: number): WikiPageNote {
  return { id, category_id, page_id: "p1", title: id, body: "", sort_index };
}

/** Rend la liste lisible : « categorie:fiche@rang ». */
function apres(notes: WikiPageNote[], plan: ReturnType<typeof planNoteMove>): string[] {
  const parId = new Map(plan.map(l => [l.id, l]));
  return notes
    .map(n => {
      const l = parId.get(n.id);
      return l ? { ...n, category_id: l.category_id, sort_index: l.sort_index } : n;
    })
    .sort((a, b) => a.category_id.localeCompare(b.category_id) || a.sort_index - b.sort_index)
    .map(n => `${n.category_id}:${n.id}@${n.sort_index}`);
}

describe("groupNotesByCategory", () => {
  it("range les fiches sous leur catégorie, dans l'ordre voulu", () => {
    const groups = groupNotesByCategory(
      [cat("b", 1), cat("a", 0)],
      [note("a2", "a", 1), note("b1", "b", 0), note("a1", "a", 0)],
    );
    expect(groups.map(g => g.category.id)).toEqual(["a", "b"]);
    expect(groups[0].notes.map(n => n.id)).toEqual(["a1", "a2"]);
    expect(groups[1].notes.map(n => n.id)).toEqual(["b1"]);
  });

  it("rend une catégorie vide plutôt que de l'omettre", () => {
    const groups = groupNotesByCategory([cat("a", 0)], []);
    expect(groups).toHaveLength(1);
    expect(groups[0].notes).toEqual([]);
  });

  it("ignore une fiche dont la catégorie a disparu", () => {
    const groups = groupNotesByCategory([cat("a", 0)], [note("orpheline", "disparue", 0)]);
    expect(groups[0].notes).toEqual([]);
  });
});

describe("planNoteMove — dans la même catégorie", () => {
  const notes = [note("n1", "a", 0), note("n2", "a", 1), note("n3", "a", 2)];

  it("descend une fiche à la place de celle visée", () => {
    expect(apres(notes, planNoteMove(notes, "n1", "a", 2)))
      .toEqual(["a:n2@0", "a:n3@1", "a:n1@2"]);
  });

  it("remonte une fiche", () => {
    expect(apres(notes, planNoteMove(notes, "n3", "a", 0)))
      .toEqual(["a:n3@0", "a:n1@1", "a:n2@2"]);
  });

  it("n'écrit que les lignes qui bougent", () => {
    // n1 et n2 s'échangent ; n3 ne bouge pas et ne doit pas être réécrite.
    const plan = planNoteMove(notes, "n1", "a", 1);
    expect(plan.map(l => l.id).sort()).toEqual(["n1", "n2"]);
  });

  it("ne renvoie rien quand la fiche ne bouge pas", () => {
    expect(planNoteMove(notes, "n2", "a", 1)).toEqual([]);
  });
});

describe("planNoteMove — d'une catégorie à l'autre", () => {
  const notes = [
    note("a1", "a", 0), note("a2", "a", 1),
    note("b1", "b", 0), note("b2", "b", 1),
  ];

  it("insère à la position visée et renumérote les deux listes", () => {
    expect(apres(notes, planNoteMove(notes, "a1", "b", 1)))
      .toEqual(["a:a2@0", "b:b1@0", "b:a1@1", "b:b2@2"]);
  });

  it("accepte une catégorie vide", () => {
    expect(apres(notes, planNoteMove(notes, "a1", "c", 0)))
      .toEqual(["a:a2@0", "b:b1@0", "b:b2@1", "c:a1@0"]);
  });

  it("borne une position hors liste au lieu de trouer l'ordre", () => {
    expect(apres(notes, planNoteMove(notes, "a1", "b", 99)))
      .toEqual(["a:a2@0", "b:b1@0", "b:b2@1", "b:a1@2"]);
  });

  it("renumérote la catégorie d'origine pour ne pas y laisser de trou", () => {
    const plan = planNoteMove(
      [note("a1", "a", 0), note("a2", "a", 1), note("a3", "a", 2)],
      "a1", "b", 0,
    );
    expect(plan.filter(l => l.category_id === "a")).toEqual([
      { id: "a2", category_id: "a", sort_index: 0 },
      { id: "a3", category_id: "a", sort_index: 1 },
    ]);
  });

  it("ignore une fiche inconnue", () => {
    expect(planNoteMove(notes, "fantome", "b", 0)).toEqual([]);
  });
});

describe("useWikiPageNotes", () => {
  const params = { pageId: "p1", worldId: "w1" };

  function monte(results: { data?: unknown; error?: unknown }[]) {
    const mock = createSupabaseMock({ results });
    const vue = renderHook(() =>
      useWikiPageNotes({ ...params, supabase: mock.client as never, enabled: true }),
    );
    return { mock, ...vue };
  }

  it("charge catégories et fiches de la page", async () => {
    const { result, mock } = monte([
      { data: [cat("a", 0, "Entités")], error: null },
      { data: [note("n1", "a", 0)], error: null },
    ]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map(g => g.category.name)).toEqual(["Entités"]);
    expect(result.current.groups[0].notes.map(n => n.id)).toEqual(["n1"]);
    expect(mock.client.from).toHaveBeenCalledWith("world_wiki_page_note_categories");
    expect(mock.client.from).toHaveBeenCalledWith("world_wiki_page_notes");
  });

  it("crée une catégorie à la suite des existantes", async () => {
    const { result, mock } = monte([
      { data: [cat("a", 0)], error: null },
      { data: [], error: null },
      { data: cat("b", 1, "Lieux"), error: null },
    ]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.createCategory("  Lieux  "); });

    expect(mock.builders[2].builder.insert.mock.calls[0][0]).toMatchObject({
      page_id: "p1",
      world_id: "w1",
      name: "Lieux",
      sort_index: 1,
    });
    expect(result.current.groups.map(g => g.category.id)).toEqual(["a", "b"]);
  });

  it("refuse une catégorie sans nom sans rien écrire", async () => {
    const { result, mock } = monte([{ data: [], error: null }, { data: [], error: null }]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      expect(await result.current.createCategory("   ")).toBeNull();
    });
    expect(mock.client.from).toHaveBeenCalledTimes(2); // le chargement seul
  });

  it("crée une fiche à la fin de sa catégorie", async () => {
    const { result, mock } = monte([
      { data: [cat("a", 0)], error: null },
      { data: [note("n1", "a", 0)], error: null },
      { data: note("n2", "a", 1), error: null },
    ]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.createNote("a", "Mara Kline"); });

    expect(mock.builders[2].builder.insert.mock.calls[0][0]).toMatchObject({
      category_id: "a",
      page_id: "p1",
      world_id: "w1",
      title: "Mara Kline",
      sort_index: 1,
    });
  });

  it("retire les fiches d'une catégorie supprimée", async () => {
    const { result } = monte([
      { data: [cat("a", 0), cat("b", 1)], error: null },
      { data: [note("n1", "a", 0), note("n2", "b", 0)], error: null },
      { data: null, error: null },
    ]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.deleteCategory(cat("a", 0)); });

    // La base emporte les fiches en cascade ; l'état local doit suivre, sinon
    // elles restent à l'écran sans en-tête jusqu'au rechargement.
    expect(result.current.notes?.map(n => n.id)).toEqual(["n2"]);
    expect(result.current.categories?.map(c => c.id)).toEqual(["b"]);
  });

  it("rétablit l'ordre précédent si la base refuse le déplacement", async () => {
    const { result } = monte([
      { data: [cat("a", 0)], error: null },
      { data: [note("n1", "a", 0), note("n2", "a", 1)], error: null },
      { data: null, error: { message: "refusé" } },
      { data: null, error: { message: "refusé" } },
    ]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.moveNote("n1", "a", 1); });

    // Sans ce retour en arrière, l'écran montrerait un rangement que la base
    // ne connaît pas, perdu au rechargement suivant.
    expect(result.current.groups[0].notes.map(n => n.id)).toEqual(["n1", "n2"]);
  });

  it("s'abonne aux deux tables pour cette page", async () => {
    const { mock } = monte([{ data: [], error: null }, { data: [], error: null }]);

    await waitFor(() => expect(mock.channels.length).toBe(1));
    expect(mock.channels[0].name).toBe("wiki_page_notes:p1");
    expect(mock.channels[0].handlers.map(h => h.config.table)).toEqual([
      "world_wiki_page_note_categories",
      "world_wiki_page_notes",
    ]);
    expect(mock.channels[0].handlers[0].config.filter).toBe("page_id=eq.p1");
  });
});
