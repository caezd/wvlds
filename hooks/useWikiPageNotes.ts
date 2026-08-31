"use client";

import * as React from "react";
import { toast } from "sonner";

import type { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import { openRealtimeChannel } from "@/lib/realtimeChannel";
import type { WikiNoteCategory, WikiPageNote } from "@/types/worlds";

const CATEGORY_COLUMNS = "id, page_id, name, sort_index";
const NOTE_COLUMNS = "id, category_id, page_id, title, body, sort_index";

/** Une catégorie et ses fiches, dans l'ordre voulu par l'éditeur. */
export type WikiNoteGroup = {
  category: WikiNoteCategory;
  notes: WikiPageNote[];
};

const bySortIndex = <T extends { sort_index: number }>(a: T, b: T) => a.sort_index - b.sort_index;

/**
 * Range les fiches sous leur catégorie. Une fiche dont la catégorie a disparu
 * de la liste est ignorée : la base l'aurait supprimée en cascade, et
 * l'afficher sans en-tête ne dirait rien de ce à quoi elle appartenait.
 */
export function groupNotesByCategory(
  categories: WikiNoteCategory[],
  notes: WikiPageNote[],
): WikiNoteGroup[] {
  const byCategory = new Map<string, WikiPageNote[]>();
  for (const note of notes) {
    const list = byCategory.get(note.category_id);
    if (list) list.push(note);
    else byCategory.set(note.category_id, [note]);
  }

  return [...categories]
    .sort(bySortIndex)
    .map((category) => ({
      category,
      notes: (byCategory.get(category.id) ?? []).sort(bySortIndex),
    }));
}

/**
 * Place `noteId` dans `toCategoryId` à la position `toIndex`, et renvoie les
 * seules lignes dont l'ordre change.
 *
 * Fonction pure, en dehors de React : c'est la pièce délicate du
 * glisser-déposer (deux listes à renuméroter quand la fiche change de
 * catégorie), et c'est celle qu'on peut vérifier sans monter d'interface.
 */
export function planNoteMove(
  notes: WikiPageNote[],
  noteId: string,
  toCategoryId: string,
  toIndex: number,
): Array<Pick<WikiPageNote, "id" | "category_id" | "sort_index">> {
  const moved = notes.find((n) => n.id === noteId);
  if (!moved) return [];

  const fromCategoryId = moved.category_id;
  const listeDe = (categoryId: string) =>
    notes.filter((n) => n.category_id === categoryId && n.id !== noteId).sort(bySortIndex);

  const destination = listeDe(toCategoryId);
  const position = Math.max(0, Math.min(toIndex, destination.length));
  destination.splice(position, 0, { ...moved, category_id: toCategoryId });

  const renumerote = (liste: WikiPageNote[], categoryId: string) =>
    liste.map((n, i) => ({ id: n.id, category_id: categoryId, sort_index: i }));

  const cible = renumerote(destination, toCategoryId);
  const source = fromCategoryId === toCategoryId
    ? []
    : renumerote(listeDe(fromCategoryId), fromCategoryId);

  // N'écrire que ce qui bouge : sur une catégorie de trente fiches, déplacer
  // la dernière ne doit pas réécrire les vingt-neuf autres.
  const avant = new Map(notes.map((n) => [n.id, n]));
  return [...cible, ...source].filter((ligne) => {
    const initial = avant.get(ligne.id);
    return !initial
      || initial.sort_index !== ligne.sort_index
      || initial.category_id !== ligne.category_id;
  });
}

/**
 * Notes d'une page de wiki : catégories, fiches, ordre et temps réel.
 *
 * Toutes les écritures sont optimistes — l'état local part devant, et revient
 * à son point de départ si la base refuse. Sans ce retour en arrière, un refus
 * (RLS, réseau) laisserait à l'écran un rangement que personne n'a enregistré,
 * perdu au rechargement suivant : c'est la leçon déjà tirée sur l'arbre des
 * pages (voir `WorldWiki.onDragEnd`).
 */
export function useWikiPageNotes({
  pageId,
  worldId,
  supabase,
  enabled = true,
}: {
  pageId: string;
  worldId: string;
  supabase: ReturnType<typeof createClient>;
  enabled?: boolean;
}) {
  const [categories, setCategories] = React.useState<WikiNoteCategory[] | null>(null);
  const [notes, setNotes] = React.useState<WikiPageNote[] | null>(null);
  const [pending, setPending] = React.useState(false);
  const reconnectEpoch = useReconnectEpoch();

  const load = React.useCallback(async () => {
    const [cats, rows] = await Promise.all([
      supabase
        .from("world_wiki_page_note_categories")
        .select(CATEGORY_COLUMNS)
        .eq("page_id", pageId)
        .order("sort_index", { ascending: true }),
      supabase
        .from("world_wiki_page_notes")
        .select(NOTE_COLUMNS)
        .eq("page_id", pageId)
        .order("sort_index", { ascending: true }),
    ]);

    if (cats.error || rows.error) {
      toast.error((cats.error ?? rows.error)!.message);
      setCategories([]);
      setNotes([]);
      return;
    }
    setCategories((cats.data ?? []) as unknown as WikiNoteCategory[]);
    setNotes((rows.data ?? []) as unknown as WikiPageNote[]);
  }, [pageId, supabase]);

  React.useEffect(() => {
    if (!enabled) return;
    void load();

    // `openRealtimeChannel` plutôt que `supabase.channel` : le panneau change
    // de place selon la largeur — colonne au-dessus de `xl`, tiroir en dessous
    // — et un passage de l'un à l'autre referme puis rouvre un canal du même
    // nom. `removeChannel` étant asynchrone, la réouverture retombait sur le
    // canal encore joint, et `.on()` lève après `subscribe()`.
    return openRealtimeChannel(
      supabase,
      `wiki_page_notes:${pageId}`,
      channel => channel
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "world_wiki_page_note_categories",
            filter: `page_id=eq.${pageId}`,
          },
          () => void load(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "world_wiki_page_notes",
            filter: `page_id=eq.${pageId}`,
          },
          () => void load(),
        )
        .subscribe(),
    );
  }, [enabled, pageId, supabase, load, reconnectEpoch]);

  /** Rejoue `revenir` et signale l'erreur si la base a refusé l'écriture. */
  function echoue(error: { message: string } | null, revenir: () => void): boolean {
    if (!error) return false;
    revenir();
    toast.error(error.message);
    return true;
  }

  // ── Catégories ────────────────────────────────────────────
  const createCategory = React.useCallback(
    async (name: string): Promise<WikiNoteCategory | null> => {
      const propre = name.trim();
      if (!propre) return null;
      setPending(true);
      const { data, error } = await supabase
        .from("world_wiki_page_note_categories")
        .insert({
          page_id: pageId,
          world_id: worldId,
          name: propre,
          sort_index: categories?.length ?? 0,
        })
        .select(CATEGORY_COLUMNS)
        .single();
      setPending(false);
      if (error) { toast.error(error.message); return null; }
      const creee = data as unknown as WikiNoteCategory;
      setCategories((prev) => [...(prev ?? []), creee]);
      return creee;
    },
    [categories, pageId, supabase, worldId],
  );

  const renameCategory = React.useCallback(
    async (category: WikiNoteCategory, name: string) => {
      const propre = name.trim();
      if (!propre || propre === category.name) return;
      const avant = categories;
      setCategories((prev) =>
        (prev ?? []).map((c) => (c.id === category.id ? { ...c, name: propre } : c)),
      );
      const { error } = await supabase
        .from("world_wiki_page_note_categories")
        .update({ name: propre })
        .eq("id", category.id);
      echoue(error, () => setCategories(avant));
    },
    [categories, supabase],
  );

  const deleteCategory = React.useCallback(
    async (category: WikiNoteCategory) => {
      const avantCats = categories;
      const avantNotes = notes;
      setCategories((prev) => (prev ?? []).filter((c) => c.id !== category.id));
      // La base emporte les fiches en cascade ; l'état local doit suivre,
      // sinon elles restent affichées sans en-tête.
      setNotes((prev) => (prev ?? []).filter((n) => n.category_id !== category.id));
      const { error } = await supabase
        .from("world_wiki_page_note_categories")
        .delete()
        .eq("id", category.id);
      echoue(error, () => { setCategories(avantCats); setNotes(avantNotes); });
    },
    [categories, notes, supabase],
  );

  const reorderCategories = React.useCallback(
    async (ordered: WikiNoteCategory[]) => {
      const avant = categories;
      const renumerotees = ordered.map((c, i) => ({ ...c, sort_index: i }));
      setCategories(renumerotees);

      const aEcrire = renumerotees.filter(
        (c) => avant?.find((a) => a.id === c.id)?.sort_index !== c.sort_index,
      );
      const resultats = await Promise.all(
        aEcrire.map((c) =>
          supabase
            .from("world_wiki_page_note_categories")
            .update({ sort_index: c.sort_index })
            .eq("id", c.id),
        ),
      );
      echoue(
        resultats.map((r) => r.error).find(Boolean) ?? null,
        () => setCategories(avant),
      );
    },
    [categories, supabase],
  );

  // ── Fiches ────────────────────────────────────────────────
  const createNote = React.useCallback(
    async (categoryId: string, title: string, body = ""): Promise<WikiPageNote | null> => {
      const propre = title.trim();
      if (!propre) return null;
      setPending(true);
      const { data, error } = await supabase
        .from("world_wiki_page_notes")
        .insert({
          category_id: categoryId,
          page_id: pageId,
          world_id: worldId,
          title: propre,
          body,
          sort_index: (notes ?? []).filter((n) => n.category_id === categoryId).length,
        })
        .select(NOTE_COLUMNS)
        .single();
      setPending(false);
      if (error) { toast.error(error.message); return null; }
      const creee = data as unknown as WikiPageNote;
      setNotes((prev) => [...(prev ?? []), creee]);
      return creee;
    },
    [notes, pageId, supabase, worldId],
  );

  const updateNote = React.useCallback(
    async (note: WikiPageNote, patch: { title?: string; body?: string }) => {
      const title = patch.title?.trim() ?? note.title;
      const body = patch.body ?? note.body;
      if (!title || (title === note.title && body === note.body)) return;

      const avant = notes;
      setNotes((prev) => (prev ?? []).map((n) => (n.id === note.id ? { ...n, title, body } : n)));
      const { error } = await supabase
        .from("world_wiki_page_notes")
        .update({ title, body })
        .eq("id", note.id);
      echoue(error, () => setNotes(avant));
    },
    [notes, supabase],
  );

  const deleteNote = React.useCallback(
    async (note: WikiPageNote) => {
      const avant = notes;
      setNotes((prev) => (prev ?? []).filter((n) => n.id !== note.id));
      const { error } = await supabase
        .from("world_wiki_page_notes")
        .delete()
        .eq("id", note.id);
      echoue(error, () => setNotes(avant));
    },
    [notes, supabase],
  );

  const moveNote = React.useCallback(
    async (noteId: string, toCategoryId: string, toIndex: number) => {
      const avant = notes;
      const plan = planNoteMove(notes ?? [], noteId, toCategoryId, toIndex);
      if (plan.length === 0) return;

      const parId = new Map(plan.map((l) => [l.id, l]));
      setNotes((prev) =>
        (prev ?? []).map((n) => {
          const ligne = parId.get(n.id);
          return ligne ? { ...n, category_id: ligne.category_id, sort_index: ligne.sort_index } : n;
        }),
      );

      const resultats = await Promise.all(
        plan.map((ligne) =>
          supabase
            .from("world_wiki_page_notes")
            .update({ category_id: ligne.category_id, sort_index: ligne.sort_index })
            .eq("id", ligne.id),
        ),
      );
      echoue(
        resultats.map((r) => r.error).find(Boolean) ?? null,
        () => setNotes(avant),
      );
    },
    [notes, supabase],
  );

  const groups = React.useMemo(
    () => groupNotesByCategory(categories ?? [], notes ?? []),
    [categories, notes],
  );

  return {
    categories,
    notes,
    groups,
    loading: enabled && (categories === null || notes === null),
    pending,
    createCategory,
    renameCategory,
    deleteCategory,
    reorderCategories,
    createNote,
    updateNote,
    deleteNote,
    moveNote,
    reload: load,
  };
}
