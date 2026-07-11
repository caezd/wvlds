-- 078_world_tags_and_avatar_type.sql
--
-- Tags libres sur les mondes (recherche/filtre sur /explore) + préférence de
-- type d'avatars accepté (réel / illustré), utilisée en filtre également.

-- ── 1. Table world_tags ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS world_tags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  tag         TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (world_id, tag)
);

CREATE INDEX IF NOT EXISTS world_tags_tag_idx ON world_tags (tag);

ALTER TABLE world_tags ENABLE ROW LEVEL SECURITY;

-- Lecture : membres du monde, ou n'importe qui pour un monde public
-- (nécessaire pour construire le filtre sur /explore).
CREATE POLICY "world_tags select if member or public" ON world_tags
  FOR SELECT USING (
    is_world_member(world_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM worlds w
      WHERE w.id = world_tags.world_id AND w.visibility = 'public' AND w.deleted_at IS NULL
    )
  );

CREATE POLICY "world_tags insert if editor" ON world_tags
  FOR INSERT WITH CHECK (is_world_editor(world_id, auth.uid()));

CREATE POLICY "world_tags delete if editor" ON world_tags
  FOR DELETE USING (is_world_editor(world_id, auth.uid()));

-- ── 2. Préférence de type d'avatars ─────────────────────────────────────────
ALTER TABLE worlds ADD COLUMN IF NOT EXISTS allows_real_avatars boolean NOT NULL DEFAULT true;
ALTER TABLE worlds ADD COLUMN IF NOT EXISTS allows_illustrated_avatars boolean NOT NULL DEFAULT true;

-- ── 3. Tags les plus utilisés parmi les mondes publics ──────────────────────
-- Alimente la liste de filtres sur /explore (limité aux 50 tags les plus
-- fréquents, le texte libre pouvant produire beaucoup de variantes rares).
CREATE OR REPLACE FUNCTION get_public_world_tags()
RETURNS TABLE (tag text, world_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT wt.tag, count(DISTINCT wt.world_id) AS world_count
  FROM world_tags wt
  JOIN worlds w ON w.id = wt.world_id
  WHERE w.visibility = 'public' AND w.deleted_at IS NULL AND w.is_archived = false
  GROUP BY wt.tag
  ORDER BY world_count DESC, wt.tag ASC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION get_public_world_tags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_world_tags() TO authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS get_public_world_tags();
-- ALTER TABLE worlds DROP COLUMN IF EXISTS allows_illustrated_avatars;
-- ALTER TABLE worlds DROP COLUMN IF EXISTS allows_real_avatars;
-- DROP TABLE IF EXISTS world_tags;
