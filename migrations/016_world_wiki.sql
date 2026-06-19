-- world_wiki_pages: wiki arborescent par monde (dossiers + pages markdown)
CREATE TABLE IF NOT EXISTS world_wiki_pages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id   UUID        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  parent_id  UUID        REFERENCES world_wiki_pages(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  slug       TEXT        NOT NULL,
  content    TEXT,
  is_folder  BOOLEAN     NOT NULL DEFAULT false,
  sort_index INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (world_id, slug)
);

ALTER TABLE world_wiki_pages ENABLE ROW LEVEL SECURITY;

-- Lecture : membres et propriétaire
CREATE POLICY wwp_select ON world_wiki_pages FOR SELECT USING (
  world_id IN (SELECT world_id FROM world_members WHERE user_id = auth.uid())
  OR world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())
);

-- Écriture : propriétaire, admin, éditeur
CREATE POLICY wwp_insert ON world_wiki_pages FOR INSERT WITH CHECK (
  world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())
  OR world_id IN (SELECT world_id FROM world_members WHERE user_id = auth.uid() AND role IN ('admin', 'editor'))
);

CREATE POLICY wwp_update ON world_wiki_pages FOR UPDATE USING (
  world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())
  OR world_id IN (SELECT world_id FROM world_members WHERE user_id = auth.uid() AND role IN ('admin', 'editor'))
);

CREATE POLICY wwp_delete ON world_wiki_pages FOR DELETE USING (
  world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())
  OR world_id IN (SELECT world_id FROM world_members WHERE user_id = auth.uid() AND role IN ('admin', 'editor'))
);

CREATE INDEX IF NOT EXISTS idx_world_wiki_pages_world ON world_wiki_pages(world_id, sort_index);
CREATE INDEX IF NOT EXISTS idx_world_wiki_pages_parent ON world_wiki_pages(parent_id);
