-- ============================================================
-- Migration 157 — Les régions d'une carte
-- ============================================================
-- Une épingle marque un point ; un royaume, une forêt, une mer sont des
-- surfaces. Une région est un polygone dessiné sur une carte : ses sommets,
-- un nom, une couleur, et — comme un lieu — une description et une page du
-- wiki.
--
-- `points` en JSONB : un tableau de `{x, y}` en pourcentages de la carte,
-- le repère des épingles. Pas de type géométrique : rien ici ne demande à
-- Postgres de calculer une intersection, et un tableau se lit tel quel côté
-- client.
--
-- `world_id` est gardé à côté de `map_id`, comme pour les épingles : les
-- politiques s'appuient dessus, et le temps réel filtre par monde.
--
-- `ON DELETE CASCADE` sur `map_id` : supprimer une carte emporte ses régions,
-- qui n'ont pas de sens ailleurs.

CREATE TABLE IF NOT EXISTS public.world_map_regions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id     UUID NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  map_id       UUID NOT NULL REFERENCES public.world_maps(id) ON DELETE CASCADE,
  label        TEXT NOT NULL DEFAULT '',
  description  TEXT,
  color        TEXT NOT NULL DEFAULT '#6366f1',
  points       JSONB NOT NULL DEFAULT '[]'::jsonb,
  wiki_page_id UUID REFERENCES public.world_wiki_pages(id) ON DELETE SET NULL,
  sort_index   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT world_map_regions_points_array CHECK (jsonb_typeof(points) = 'array')
);

-- Les régions d'une carte, dans leur ordre.
CREATE INDEX IF NOT EXISTS world_map_regions_map_idx
  ON public.world_map_regions (map_id, sort_index);

-- ── RLS : calquée sur les épingles (migration 019) ──────────
ALTER TABLE public.world_map_regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "world_map_regions_read" ON public.world_map_regions;
CREATE POLICY "world_map_regions_read" ON public.world_map_regions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_map_regions.world_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_map_regions.world_id AND m.user_id = auth.uid())
);

DROP POLICY IF EXISTS "world_map_regions_write" ON public.world_map_regions;
CREATE POLICY "world_map_regions_write" ON public.world_map_regions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_map_regions.world_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_map_regions.world_id AND m.user_id = auth.uid() AND m.role IN ('admin','editor'))
);

-- ── Temps réel ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'world_map_regions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.world_map_regions;
  END IF;
END $$;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT policyname FROM pg_policies WHERE tablename = 'world_map_regions';
--   -- attendu : world_map_regions_read, world_map_regions_write

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.world_map_regions;
-- DROP TABLE IF EXISTS public.world_map_regions;
