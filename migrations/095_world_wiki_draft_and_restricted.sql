-- ============================================================
-- Migration 095 — Wiki : brouillon avant publication + pages restreintes
-- ============================================================
-- Deux besoins orthogonaux pour l'édition collaborative du wiki :
--  - un tampon de brouillon autosauvegardé, distinct du contenu publié
--    (le contenu vu par les lecteurs ne change qu'à la publication) ;
--  - des pages (ou dossiers, en cascade sur tout leur sous-arbre) réservées
--    aux éditeurs du monde, invisibles des autres membres — ex. notes de MJ.
-- La vraie barrière est en RLS, pas côté client : le SELECT existant
-- (migration 016) autorisait tout membre sans distinction de rôle ni de
-- statut de publication.

-- ── 1. Colonnes ───────────────────────────────────────────────

ALTER TABLE public.world_wiki_pages
  ADD COLUMN IF NOT EXISTS draft_content    TEXT,
  ADD COLUMN IF NOT EXISTS draft_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_restricted    BOOLEAN NOT NULL DEFAULT false;

-- Backfill : les pages déjà écrites sont considérées publiées, pour ne pas
-- les faire disparaître de la lecture pour les membres non-éditeurs.
UPDATE public.world_wiki_pages
  SET published_at = updated_at
  WHERE NOT is_folder AND content IS NOT NULL AND published_at IS NULL;


-- ── 2. wwp_is_restricted : restriction en cascade ────────────
-- Vrai si la page elle-même ou un de ses ancêtres (dossier) est marqué
-- is_restricted — un dossier réservé masque tout son contenu sans avoir à
-- marquer chaque page individuellement (sinon fuite d'info par oubli).

CREATE OR REPLACE FUNCTION public.wwp_is_restricted(p_page_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, is_restricted
    FROM world_wiki_pages WHERE id = p_page_id
    UNION ALL
    SELECT p.id, p.parent_id, p.is_restricted
    FROM world_wiki_pages p
    JOIN ancestors a ON p.id = a.parent_id
  )
  SELECT COALESCE(bool_or(is_restricted), false) FROM ancestors;
$$;


-- ── 3. RLS : normalisée sur les helpers is_world_editor/is_world_member
-- (la migration 016 utilisait des sous-requêtes inline, antérieures à cette
-- convention consolidée dans les migrations 038/039 et suivantes).

DROP POLICY IF EXISTS wwp_select ON public.world_wiki_pages;
CREATE POLICY wwp_select ON public.world_wiki_pages FOR SELECT USING (
  public.is_world_editor(world_id, auth.uid())
  OR (
    public.is_world_member(world_id, auth.uid())
    AND (is_folder OR published_at IS NOT NULL)
    AND NOT public.wwp_is_restricted(id)
  )
);

DROP POLICY IF EXISTS wwp_insert ON public.world_wiki_pages;
CREATE POLICY wwp_insert ON public.world_wiki_pages FOR INSERT WITH CHECK (
  public.is_world_editor(world_id, auth.uid())
);

DROP POLICY IF EXISTS wwp_update ON public.world_wiki_pages;
CREATE POLICY wwp_update ON public.world_wiki_pages FOR UPDATE USING (
  public.is_world_editor(world_id, auth.uid())
);

DROP POLICY IF EXISTS wwp_delete ON public.world_wiki_pages;
CREATE POLICY wwp_delete ON public.world_wiki_pages FOR DELETE USING (
  public.is_world_editor(world_id, auth.uid())
);
