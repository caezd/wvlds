-- ============================================================
-- Migration 143 — Bannière et description d'une page de wiki
-- ============================================================
-- Une page peut désormais s'ouvrir sur une image pleine largeur, suivie de son
-- icône, de son titre et d'une description courte — la même mise en page que
-- l'accueil d'une documentation.
--
-- `description` est bornée à 255 caractères : c'est un chapeau, pas un second
-- article. La borne vit ici ET dans lib/textLimits.ts — voir migration 126 :
-- la RLS dit qui écrit, jamais combien.
--
-- `banner_url` n'est pas contrainte à une URL : les images du monde vivent dans
-- le bucket `worlds` et l'URL publique est produite par supabase-js. Une
-- contrainte de forme n'apporterait rien qu'un risque de rejet sur un domaine
-- de stockage qui change.

ALTER TABLE public.world_wiki_pages
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.world_wiki_pages
  ADD CONSTRAINT wwp_description_len CHECK (char_length(description) <= 255);

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'world_wiki_pages' AND column_name IN ('banner_url', 'description');
--     -- banner_url
--     -- description
--
--   UPDATE public.world_wiki_pages SET description = repeat('x', 256) WHERE id = '...';
--     -- ERROR: new row violates check constraint "wwp_description_len"

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.world_wiki_pages DROP CONSTRAINT IF EXISTS wwp_description_len;
-- ALTER TABLE public.world_wiki_pages DROP COLUMN IF EXISTS description;
-- ALTER TABLE public.world_wiki_pages DROP COLUMN IF EXISTS banner_url;
