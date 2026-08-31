"use client";

import * as React from "react";
import { toast } from "sonner";

import type { createClient } from "@/lib/supabase/client";
import { useReconnectEpoch } from "@/hooks/useReconnectEpoch";
import type { TextAnchor } from "@/lib/wikiAnnotations";
import type {
  WikiAnnotation,
  WikiAnnotationKind,
  WikiAnnotationThread,
} from "@/types/worlds";

/**
 * `profiles` est référencée deux fois par la table (`author_id` et
 * `resolved_by`) : sans le repère `!author_id`, PostgREST refuse l'imbrication
 * comme ambiguë.
 */
const ANNOTATION_COLUMNS =
  "id, page_id, parent_id, author_id, kind, body, " +
  "anchor_quote, anchor_prefix, anchor_suffix, anchor_start, " +
  "resolved_at, resolved_by, created_at, " +
  "author:profiles!author_id(id, username, avatar_url)";

export type CreateThreadInput = {
  kind: WikiAnnotationKind;
  anchor: TextAnchor;
  body: string;
};

/**
 * Regroupe les annotations d'une page en fils : une racine ancrée, puis ses
 * réponses par ordre de publication.
 *
 * Une réponse dont la racine est absente de la liste — la migration interdit
 * ce cas, mais une lecture partielle sous RLS pourrait le produire — est
 * ignorée plutôt que promue en fil : elle s'afficherait sans ancre, donc sans
 * moyen de comprendre à quoi elle répond.
 */
export function groupIntoThreads(annotations: WikiAnnotation[]): WikiAnnotationThread[] {
  const roots = annotations.filter((a) => a.parent_id === null);
  const repliesByRoot = new Map<string, WikiAnnotation[]>();

  for (const a of annotations) {
    if (a.parent_id === null) continue;
    const list = repliesByRoot.get(a.parent_id);
    if (list) list.push(a);
    else repliesByRoot.set(a.parent_id, [a]);
  }

  return roots.map((root) => ({
    root,
    replies: (repliesByRoot.get(root.id) ?? []).sort(
      (a, b) => a.created_at.localeCompare(b.created_at),
    ),
  }));
}

/**
 * Annotations d'une page de wiki : chargement, temps réel et écritures.
 *
 * Les écritures mettent l'état local à jour depuis la ligne renvoyée par
 * PostgREST plutôt que d'attendre l'aller-retour temps réel — l'auteur voit
 * son commentaire immédiatement, même si le canal met une seconde à relayer.
 */
export function useWikiAnnotations({
  pageId,
  worldId,
  userId,
  supabase,
  enabled = true,
}: {
  pageId: string;
  worldId: string;
  /** Utilisateur courant — auteur des annotations créées ici. */
  userId: string | null;
  supabase: ReturnType<typeof createClient>;
  /** `false` tant que le panneau n'a jamais été ouvert : rien n'est chargé. */
  enabled?: boolean;
}) {
  const [annotations, setAnnotations] = React.useState<WikiAnnotation[] | null>(null);
  const [pending, setPending] = React.useState(false);
  const reconnectEpoch = useReconnectEpoch();

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("world_wiki_page_annotations")
      .select(ANNOTATION_COLUMNS)
      .eq("page_id", pageId)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      setAnnotations([]);
      return;
    }
    setAnnotations((data ?? []) as unknown as WikiAnnotation[]);
  }, [pageId, supabase]);

  React.useEffect(() => {
    if (!enabled) return;
    void load();

    const channel = supabase
      .channel(`wiki_annotations:${pageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "world_wiki_page_annotations",
          filter: `page_id=eq.${pageId}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, pageId, supabase, load, reconnectEpoch]);

  /** Insère la ligne rendue par la base, ou remplace celle du même id. */
  const merge = React.useCallback((row: WikiAnnotation) => {
    setAnnotations((prev) => {
      const list = prev ?? [];
      const at = list.findIndex((a) => a.id === row.id);
      if (at === -1) return [...list, row];
      const next = [...list];
      next[at] = row;
      return next;
    });
  }, []);

  const insert = React.useCallback(
    async (row: Record<string, unknown>): Promise<WikiAnnotation | null> => {
      if (!userId) return null;
      setPending(true);
      const { data, error } = await supabase
        .from("world_wiki_page_annotations")
        .insert({ ...row, page_id: pageId, world_id: worldId, author_id: userId })
        .select(ANNOTATION_COLUMNS)
        .single();
      setPending(false);
      if (error) {
        toast.error(error.message);
        return null;
      }
      const created = data as unknown as WikiAnnotation;
      merge(created);
      return created;
    },
    [merge, pageId, supabase, userId, worldId],
  );

  const createThread = React.useCallback(
    ({ kind, anchor, body }: CreateThreadInput) =>
      insert({
        kind,
        body: body.trim(),
        parent_id: null,
        anchor_quote: anchor.quote,
        anchor_prefix: anchor.prefix,
        anchor_suffix: anchor.suffix,
        anchor_start: anchor.start,
      }),
    [insert],
  );

  const reply = React.useCallback(
    (root: WikiAnnotation, body: string) =>
      // La nature suit celle de la racine : répondre à une note ne doit pas
      // publier un commentaire visible de tous les membres.
      insert({ kind: root.kind, body: body.trim(), parent_id: root.id }),
    [insert],
  );

  const updateBody = React.useCallback(
    async (annotation: WikiAnnotation, body: string) => {
      const trimmed = body.trim();
      if (!trimmed || trimmed === annotation.body) return;
      setPending(true);
      const { data, error } = await supabase
        .from("world_wiki_page_annotations")
        .update({ body: trimmed })
        .eq("id", annotation.id)
        .select(ANNOTATION_COLUMNS)
        .single();
      setPending(false);
      if (error) { toast.error(error.message); return; }
      merge(data as unknown as WikiAnnotation);
    },
    [merge, supabase],
  );

  const setResolved = React.useCallback(
    async (root: WikiAnnotation, resolved: boolean) => {
      if (!userId) return;
      setPending(true);
      const { data, error } = await supabase
        .from("world_wiki_page_annotations")
        .update(
          resolved
            ? { resolved_at: new Date().toISOString(), resolved_by: userId }
            : { resolved_at: null, resolved_by: null },
        )
        .eq("id", root.id)
        .select(ANNOTATION_COLUMNS)
        .single();
      setPending(false);
      if (error) { toast.error(error.message); return; }
      merge(data as unknown as WikiAnnotation);
    },
    [merge, supabase, userId],
  );

  const remove = React.useCallback(
    async (annotation: WikiAnnotation) => {
      setPending(true);
      const { error } = await supabase
        .from("world_wiki_page_annotations")
        .delete()
        .eq("id", annotation.id);
      setPending(false);
      if (error) { toast.error(error.message); return; }
      // Le CASCADE de la base emporte les réponses ; l'état local doit suivre.
      setAnnotations((prev) =>
        (prev ?? []).filter((a) => a.id !== annotation.id && a.parent_id !== annotation.id),
      );
    },
    [supabase],
  );

  const threads = React.useMemo(
    () => groupIntoThreads(annotations ?? []),
    [annotations],
  );

  return {
    annotations,
    threads,
    loading: enabled && annotations === null,
    pending,
    createThread,
    reply,
    updateBody,
    setResolved,
    remove,
    reload: load,
  };
}
