-- ============================================================
-- Migration 096 — Wiki : historique des versions
-- ============================================================
-- Snapshot complet du contenu à chaque publication (pas de diff : volumétrie
-- négligeable pour un wiki de monde). Écriture via trigger AFTER UPDATE
-- (garantit la cohérence même si le front oublie), jamais par appel
-- applicatif direct — une restauration republie via un UPDATE normal, ce qui
-- génère naturellement une nouvelle entrée d'historique.

CREATE TABLE IF NOT EXISTS public.world_wiki_page_versions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    UUID        NOT NULL REFERENCES public.world_wiki_pages(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  content    TEXT,
  author_id  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_world_wiki_page_versions_page
  ON public.world_wiki_page_versions(page_id, created_at DESC);

ALTER TABLE public.world_wiki_page_versions ENABLE ROW LEVEL SECURITY;

-- Lecture réservée aux éditeurs du monde — l'historique est un outil
-- éditorial, pas un besoin lecteur.
CREATE POLICY wwpv_select ON public.world_wiki_page_versions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.world_wiki_pages p
    WHERE p.id = world_wiki_page_versions.page_id
      AND public.is_world_editor(p.world_id, auth.uid())
  )
);

-- Pas de policy INSERT/UPDATE/DELETE côté client : seul le trigger
-- SECURITY DEFINER ci-dessous écrit dans cette table.

CREATE OR REPLACE FUNCTION public.wwp_log_version()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content AND NEW.published_at IS NOT NULL THEN
    INSERT INTO public.world_wiki_page_versions (page_id, title, content, author_id)
    VALUES (NEW.id, NEW.title, NEW.content, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wwp_version_on_publish ON public.world_wiki_pages;
CREATE TRIGGER wwp_version_on_publish
  AFTER UPDATE ON public.world_wiki_pages
  FOR EACH ROW EXECUTE FUNCTION public.wwp_log_version();
