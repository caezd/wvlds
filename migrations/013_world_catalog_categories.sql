-- world_catalog_categories: catégories pour organiser les objets et compétences du catalogue
CREATE TABLE IF NOT EXISTS world_catalog_categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id   UUID        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN ('inventory', 'skills')),
  name       TEXT        NOT NULL,
  sort_index INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE world_catalog_categories ENABLE ROW LEVEL SECURITY;

-- Lecture : membres et propriétaire
CREATE POLICY wcc_select ON world_catalog_categories FOR SELECT USING (
  world_id IN (SELECT world_id FROM world_members WHERE user_id = auth.uid())
  OR world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())
);

-- Écriture : admin, éditeur, propriétaire
CREATE POLICY wcc_insert ON world_catalog_categories FOR INSERT WITH CHECK (
  world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())
  OR world_id IN (SELECT world_id FROM world_members WHERE user_id = auth.uid() AND role IN ('admin', 'editor'))
);

CREATE POLICY wcc_update ON world_catalog_categories FOR UPDATE USING (
  world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())
  OR world_id IN (SELECT world_id FROM world_members WHERE user_id = auth.uid() AND role IN ('admin', 'editor'))
);

CREATE POLICY wcc_delete ON world_catalog_categories FOR DELETE USING (
  world_id IN (SELECT id FROM worlds WHERE owner_id = auth.uid())
  OR world_id IN (SELECT world_id FROM world_members WHERE user_id = auth.uid() AND role IN ('admin', 'editor'))
);

-- Ajout de category_id aux tables existantes
ALTER TABLE world_inventory_items
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES world_catalog_categories(id) ON DELETE SET NULL;

ALTER TABLE world_skills
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES world_catalog_categories(id) ON DELETE SET NULL;
