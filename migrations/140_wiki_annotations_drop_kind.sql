-- ============================================================
-- Migration 140 — Une seule nature d'annotation ancrée
-- ============================================================
-- Les annotations ancrées naissaient en deux natures : le commentaire, ouvert
-- aux membres, et le mémo de rédaction, réservé aux éditeurs (migration 137,
-- renommé par la 138). À l'usage, le mémo ne se distinguait du commentaire que
-- par sa visibilité — même ancrage, même fil, même résolution, même
-- formulaire. Deux mots pour une seule mécanique.
--
-- Le besoin qu'il servait — noter quelque chose à propos de l'article sans
-- s'adresser à personne — est repris par les notes de page (migration 139),
-- qui ne sont pas ancrées à un passage et n'ont donc jamais eu à emprunter la
-- plomberie des commentaires.
--
-- Les 137 et 138 ne sont pas réécrites : elles ont été appliquées, et la table
-- porte des lignes réelles. Cette migration défait la 138 au grand jour plutôt
-- que de faire disparaître la trace d'une décision.

-- Les mémos existants deviennent des commentaires : leur texte est conservé.
-- ATTENTION : un mémo n'était lisible que des éditeurs ; devenu commentaire,
-- il est visible de tout membre qui voit la page. Sur cette base il s'agit
-- d'une seule ligne d'essai, mais le point vaut d'être su avant de rejouer
-- cette migration ailleurs — sinon, la supprimer plutôt que la convertir.
UPDATE public.world_wiki_page_annotations
   SET kind = 'comment'
 WHERE kind <> 'comment';

-- Les deux policies qui nomment `kind` tombent AVANT la colonne : Postgres
-- refuse de supprimer une colonne dont une policy dépend, et le ferait
-- volontiers en CASCADE — ce qui emporterait les policies sans le dire.
DROP POLICY IF EXISTS "wwpa_select" ON public.world_wiki_page_annotations;
DROP POLICY IF EXISTS "wwpa_insert" ON public.world_wiki_page_annotations;

ALTER TABLE public.world_wiki_page_annotations
  DROP CONSTRAINT IF EXISTS wwpa_kind_known;

ALTER TABLE public.world_wiki_page_annotations
  DROP COLUMN IF EXISTS kind;

-- ── Policies ─────────────────────────────────────────────────
-- Recréées sans `kind`. La lecture reste déléguée à la RLS des pages,
-- l'écriture réservée aux membres.
CREATE POLICY "wwpa_select" ON public.world_wiki_page_annotations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.world_wiki_pages p WHERE p.id = page_id));

CREATE POLICY "wwpa_insert" ON public.world_wiki_page_annotations
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (select auth.uid())
    AND world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = page_id)
    AND is_world_member(world_id, (select auth.uid()))
  );

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name = 'world_wiki_page_annotations' AND column_name = 'kind';  -- 0
--   SELECT count(*) FROM pg_policies
--    WHERE tablename = 'world_wiki_page_annotations';                            -- 4

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.world_wiki_page_annotations ADD COLUMN kind TEXT NOT NULL DEFAULT 'comment';
-- ALTER TABLE public.world_wiki_page_annotations
--   ADD CONSTRAINT wwpa_kind_known CHECK (kind IN ('comment', 'memo'));
-- (puis recréer wwpa_select / wwpa_insert avec la clause `kind <> 'memo'`)
