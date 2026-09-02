-- ============================================================
-- Migration 138 — L'annotation ancrée « note » devient « mémo »
-- ============================================================
-- Le panneau de notes d'une page (migration 139) introduit des « notes » qui
-- ne sont pas ancrées à un passage : ce sont des fiches, rangées en
-- catégories, qui complètent l'article. Deux choses différentes auraient porté
-- le même mot à l'écran.
--
-- L'annotation ancrée réservée aux éditeurs prend donc son propre nom :
-- « mémo ». La donnée change de valeur, pas de forme.
--
-- La 137 n'est pas réécrite : elle est déjà appliquée, et la table porte des
-- lignes réelles. Une migration qui renomme se relit mieux qu'une migration
-- réécrite après coup, dont plus rien ne dirait qu'elle a menti à ceux qui
-- l'avaient déjà jouée.

-- La contrainte tombe d'abord : sans quoi l'UPDATE se heurterait à elle.
ALTER TABLE public.world_wiki_page_annotations
  DROP CONSTRAINT IF EXISTS wwpa_kind_known;

UPDATE public.world_wiki_page_annotations
   SET kind = 'memo'
 WHERE kind = 'note';

ALTER TABLE public.world_wiki_page_annotations
  ADD CONSTRAINT wwpa_kind_known CHECK (kind IN ('comment', 'memo'));

-- ── Policies ─────────────────────────────────────────────────
-- Deux d'entre elles nommaient la valeur en clair. Recréées à l'identique,
-- au mot près.
DROP POLICY IF EXISTS "wwpa_select" ON public.world_wiki_page_annotations;
CREATE POLICY "wwpa_select" ON public.world_wiki_page_annotations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.world_wiki_pages p WHERE p.id = page_id)
    AND (kind <> 'memo' OR is_world_editor(world_id, (select auth.uid())))
  );

DROP POLICY IF EXISTS "wwpa_insert" ON public.world_wiki_page_annotations;
CREATE POLICY "wwpa_insert" ON public.world_wiki_page_annotations
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (select auth.uid())
    AND world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = page_id)
    AND is_world_member(world_id, (select auth.uid()))
    AND (kind <> 'memo' OR is_world_editor(world_id, (select auth.uid())))
  );

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT kind, count(*) FROM world_wiki_page_annotations GROUP BY kind;
--     -- plus aucune ligne 'note'
--   SELECT count(*) FROM pg_policies
--    WHERE tablename = 'world_wiki_page_annotations';   -- 4, inchangé

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.world_wiki_page_annotations DROP CONSTRAINT wwpa_kind_known;
-- UPDATE public.world_wiki_page_annotations SET kind = 'note' WHERE kind = 'memo';
-- ALTER TABLE public.world_wiki_page_annotations
--   ADD CONSTRAINT wwpa_kind_known CHECK (kind IN ('comment', 'note'));
-- (puis recréer wwpa_select / wwpa_insert avec 'note')
