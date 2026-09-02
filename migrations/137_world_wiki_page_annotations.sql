-- ============================================================
-- Migration 137 — Commentaires et notes ancrés aux pages du wiki
-- ============================================================
-- Une annotation est attachée à un extrait précis du texte d'une page — pas à
-- la page entière. L'ancre elle-même (extrait, voisinage, position) est décrite
-- dans `lib/wikiAnnotations.ts` ; la base ne fait que la stocker.
--
-- Deux natures dans une seule table, distinguées par `kind` :
--   comment → fil de discussion, visible de tout membre qui voit la page ;
--   note    → mémo de rédaction, réservé aux éditeurs du monde.
-- Une table unique parce que tout le reste est commun : ancrage, fil de
-- réponses, résolution, droits d'écriture. Deux tables auraient dupliqué les
-- quatre policies et obligé le panneau à fusionner deux requêtes pour afficher
-- une seule colonne.
--
-- `world_id` est dénormalisé depuis la page : les policies s'en servent pour
-- appeler `is_world_editor` sans jointure, et sa cohérence avec `page_id` est
-- vérifiée à l'écriture (voir les policies plus bas).

CREATE TABLE IF NOT EXISTS public.world_wiki_page_annotations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id       UUID NOT NULL REFERENCES public.world_wiki_pages(id) ON DELETE CASCADE,
  world_id      UUID NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  -- Réponse dans un fil : `parent_id` pointe la racine, qui porte l'ancre.
  parent_id     UUID REFERENCES public.world_wiki_page_annotations(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  body          TEXT NOT NULL,
  -- ── Ancre (racine uniquement) ─────────────────────────────
  anchor_quote  TEXT,
  anchor_prefix TEXT,
  anchor_suffix TEXT,
  anchor_start  INTEGER,
  -- ── Résolution ────────────────────────────────────────────
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Cohérence des lignes ─────────────────────────────────────
ALTER TABLE public.world_wiki_page_annotations
  ADD CONSTRAINT wwpa_kind_known CHECK (kind IN ('comment', 'note'));

ALTER TABLE public.world_wiki_page_annotations
  ADD CONSTRAINT wwpa_body_not_blank CHECK (btrim(body) <> '');

-- Une racine porte une ancre, une réponse n'en porte aucune. Sans cette
-- contrainte, une réponse ancrée ailleurs que son fil serait acceptée et
-- s'afficherait comme un second surlignage orphelin dans la page.
ALTER TABLE public.world_wiki_page_annotations
  ADD CONSTRAINT wwpa_anchor_shape CHECK (
    (parent_id IS NULL
      AND anchor_quote IS NOT NULL
      AND anchor_start IS NOT NULL
      AND anchor_start >= 0)
    OR
    (parent_id IS NOT NULL
      AND anchor_quote IS NULL
      AND anchor_prefix IS NULL
      AND anchor_suffix IS NULL
      AND anchor_start IS NULL)
  );

-- Résolu par qui, et quand : les deux ensemble ou aucun des deux.
ALTER TABLE public.world_wiki_page_annotations
  ADD CONSTRAINT wwpa_resolution_shape CHECK ((resolved_at IS NULL) = (resolved_by IS NULL));

-- ── Bornes de longueur ───────────────────────────────────────
-- Voir migration 126 : la RLS dit qui écrit, jamais combien. Reportées dans
-- `lib/textLimits.ts`, dont un test refuse toute divergence.
ALTER TABLE public.world_wiki_page_annotations
  ADD CONSTRAINT wwpa_body_len CHECK (char_length(body) <= 4000);
ALTER TABLE public.world_wiki_page_annotations
  ADD CONSTRAINT wwpa_anchor_quote_len CHECK (char_length(anchor_quote) <= 1000);
ALTER TABLE public.world_wiki_page_annotations
  ADD CONSTRAINT wwpa_anchor_prefix_len CHECK (char_length(anchor_prefix) <= 200);
ALTER TABLE public.world_wiki_page_annotations
  ADD CONSTRAINT wwpa_anchor_suffix_len CHECK (char_length(anchor_suffix) <= 200);

-- ── Index ────────────────────────────────────────────────────
-- Le panneau lit toujours « les annotations de cette page, dans l'ordre » ;
-- l'index couvre ce seul accès.
CREATE INDEX IF NOT EXISTS wwpa_page_created_idx
  ON public.world_wiki_page_annotations (page_id, created_at);

-- Le CASCADE de `parent_id` balaie les réponses à la suppression d'un fil :
-- sans index, ce balayage est un parcours complet de la table.
CREATE INDEX IF NOT EXISTS wwpa_parent_idx
  ON public.world_wiki_page_annotations (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wwpa_author_idx
  ON public.world_wiki_page_annotations (author_id);

CREATE INDEX IF NOT EXISTS wwpa_resolved_by_idx
  ON public.world_wiki_page_annotations (resolved_by)
  WHERE resolved_by IS NOT NULL;

-- ── updated_at ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'world_wiki_page_annotations_updated_at' AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER world_wiki_page_annotations_updated_at
      BEFORE UPDATE ON public.world_wiki_page_annotations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.world_wiki_page_annotations ENABLE ROW LEVEL SECURITY;

-- Lecture : la visibilité suit celle de la page, déléguée à la RLS de
-- `world_wiki_pages` — l'EXISTS ne rend une ligne que si le lecteur a le droit
-- de voir la page. Recopier ici la règle des pages restreintes
-- (`wwp_is_restricted`) aurait créé une seconde définition à maintenir, qui
-- aurait divergé au premier changement. Les notes se restreignent en plus aux
-- éditeurs.
DROP POLICY IF EXISTS "wwpa_select" ON public.world_wiki_page_annotations;
CREATE POLICY "wwpa_select" ON public.world_wiki_page_annotations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.world_wiki_pages p WHERE p.id = page_id)
    AND (kind <> 'note' OR is_world_editor(world_id, (select auth.uid())))
  );

-- Écriture : on signe ce qu'on écrit, `world_id` doit être celui de la page
-- (le sous-select est lui aussi filtré par la RLS des pages : viser une page
-- qu'on ne peut pas voir rend NULL, donc refuse l'insertion), commenter
-- demande d'être membre, prendre une note d'être éditeur.
DROP POLICY IF EXISTS "wwpa_insert" ON public.world_wiki_page_annotations;
CREATE POLICY "wwpa_insert" ON public.world_wiki_page_annotations
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (select auth.uid())
    AND world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = page_id)
    AND is_world_member(world_id, (select auth.uid()))
    AND (kind <> 'note' OR is_world_editor(world_id, (select auth.uid())))
  );

-- Modification : son propre texte, ou n'importe quel fil pour un éditeur (qui
-- doit pouvoir le marquer comme résolu). Le WITH CHECK est écrit en toutes
-- lettres plutôt que laissé à la valeur du USING : sans lui, un auteur pourrait
-- déplacer son annotation vers une page d'un autre monde, la condition
-- `author_id = auth.uid()` restant vraie après coup.
DROP POLICY IF EXISTS "wwpa_update" ON public.world_wiki_page_annotations;
CREATE POLICY "wwpa_update" ON public.world_wiki_page_annotations
  FOR UPDATE TO authenticated
  USING (
    author_id = (select auth.uid())
    OR is_world_editor(world_id, (select auth.uid()))
  )
  WITH CHECK (
    (author_id = (select auth.uid()) OR is_world_editor(world_id, (select auth.uid())))
    AND world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = page_id)
  );

DROP POLICY IF EXISTS "wwpa_delete" ON public.world_wiki_page_annotations;
CREATE POLICY "wwpa_delete" ON public.world_wiki_page_annotations
  FOR DELETE TO authenticated
  USING (
    author_id = (select auth.uid())
    OR is_world_editor(world_id, (select auth.uid()))
  );

-- ── Temps réel ───────────────────────────────────────────────
-- Deux personnes relisent la même page : un commentaire posé par l'une doit
-- apparaître chez l'autre sans rechargement.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'world_wiki_page_annotations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.world_wiki_page_annotations;
  END IF;
END $$;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT count(*) FROM pg_policies
--    WHERE tablename = 'world_wiki_page_annotations';             -- 4
--   SELECT relrowsecurity FROM pg_class
--    WHERE oid = 'public.world_wiki_page_annotations'::regclass;  -- true
-- Sous le rôle anon, la table doit rester vide :
--   SET LOCAL ROLE anon;
--   SELECT count(*) FROM world_wiki_page_annotations;             -- 0

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.world_wiki_page_annotations;
-- DROP TABLE IF EXISTS public.world_wiki_page_annotations;
