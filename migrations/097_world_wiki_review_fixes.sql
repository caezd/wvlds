-- ============================================================
-- Migration 097 — Wiki : corrections de revue (RLS + historique)
-- ============================================================
-- Deux findings de revue de code sur les migrations 095/096 :
--  - wwp_update n'avait pas de WITH CHECK : USING seul valide la ligne
--    AVANT l'update, pas la ligne résultante — un éditeur pouvait
--    réassigner world_id vers un autre monde dans le même UPDATE sans que
--    rien ne l'en empêche.
--  - le trigger d'historique ne se déclenchait que si `content` changeait,
--    pas si seul `published_at` changeait — republier un contenu
--    identique, ou restaurer une version qui coïncide avec le contenu déjà
--    publié, ne créait alors aucune entrée d'historique (contredit
--    l'intention "une restauration crée elle-même une nouvelle entrée").

DROP POLICY IF EXISTS wwp_update ON public.world_wiki_pages;
CREATE POLICY wwp_update ON public.world_wiki_pages FOR UPDATE USING (
  public.is_world_editor(world_id, auth.uid())
) WITH CHECK (
  public.is_world_editor(world_id, auth.uid())
);

CREATE OR REPLACE FUNCTION public.wwp_log_version()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  IF NEW.published_at IS NOT NULL
     AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.published_at IS DISTINCT FROM OLD.published_at)
  THEN
    INSERT INTO public.world_wiki_page_versions (page_id, title, content, author_id)
    VALUES (NEW.id, NEW.title, NEW.content, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
