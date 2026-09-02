-- ============================================================
-- Migration 150 — Une épingle de la carte renvoie à une page du wiki
-- ============================================================
-- La carte est l'index géographique d'un monde, et le wiki en est le texte :
-- rien ne les reliait. Une épingle avait un titre, une couleur, un visuel —
-- jamais la page du lieu qu'elle marque.
--
-- `ON DELETE SET NULL` : supprimer la page (pour de bon — la corbeille ne
-- supprime rien) délie l'épingle sans l'emporter. Le lieu reste sur la carte,
-- il n'a plus de page, c'est tout.
--
-- Pas de contrainte de monde entre l'épingle et la page : la RLS de
-- `world_map_pins` (éditeurs du monde) et celle de `world_wiki_pages` bornent
-- déjà ce qu'un éditeur peut désigner, et l'application ne propose que les
-- pages du monde de la carte.

ALTER TABLE public.world_map_pins
  ADD COLUMN IF NOT EXISTS wiki_page_id UUID
    REFERENCES public.world_wiki_pages(id) ON DELETE SET NULL;

-- Retrouver les épingles d'une page — pour, un jour, faire l'inverse : « où
-- est ce lieu sur la carte ? ».
CREATE INDEX IF NOT EXISTS wmp_wiki_page_idx
  ON public.world_map_pins (wiki_page_id)
  WHERE wiki_page_id IS NOT NULL;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'world_map_pins' AND column_name = 'wiki_page_id';

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.wmp_wiki_page_idx;
-- ALTER TABLE public.world_map_pins DROP COLUMN IF EXISTS wiki_page_id;
