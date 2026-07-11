-- 086_get_world_ids_for_tags.sql
--
-- Le filtre par tags de /explore (app/(protected)/explore/page.tsx)
-- chargeait toutes les lignes world_tags correspondant aux tags choisis puis
-- dédoublonnait les world_id en mémoire côté serveur Next : sur un tag très
-- populaire, ça peut faire transiter beaucoup de lignes pour ne garder au
-- final qu'un id par monde. Le dédoublonnage (DISTINCT) est fait ici côté
-- base, comme get_public_world_tags (migration 078) le fait déjà pour la
-- liste de tags.

CREATE OR REPLACE FUNCTION get_world_ids_for_tags(tags text[])
RETURNS TABLE (world_id uuid)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT wt.world_id
  FROM world_tags wt
  WHERE wt.tag = ANY(tags);
$$;

REVOKE ALL ON FUNCTION get_world_ids_for_tags(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_world_ids_for_tags(text[]) TO authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS get_world_ids_for_tags(text[]);
