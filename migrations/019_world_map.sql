-- Configuration de la carte (une par monde)
CREATE TABLE IF NOT EXISTS world_maps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  image_url   TEXT,
  label       TEXT NOT NULL DEFAULT 'Carte',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (world_id)
);

-- Pins sur la carte
CREATE TABLE IF NOT EXISTS world_map_pins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  x           DOUBLE PRECISION NOT NULL, -- 0-100 : % de la largeur de l'image
  y           DOUBLE PRECISION NOT NULL, -- 0-100 : % de la hauteur de l'image
  title       TEXT NOT NULL DEFAULT '',
  description TEXT,
  banner_url  TEXT,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  sort_index  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE world_maps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_map_pins ENABLE ROW LEVEL SECURITY;

-- world_maps : lecture pour les membres, écriture pour owner/admin/editor
CREATE POLICY "world_maps_read" ON world_maps FOR SELECT USING (
  EXISTS (SELECT 1 FROM worlds      w WHERE w.id       = world_maps.world_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM world_members m WHERE m.world_id = world_maps.world_id AND m.user_id = auth.uid())
);

CREATE POLICY "world_maps_write" ON world_maps FOR ALL USING (
  EXISTS (SELECT 1 FROM worlds      w WHERE w.id       = world_maps.world_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM world_members m WHERE m.world_id = world_maps.world_id AND m.user_id = auth.uid() AND m.role IN ('admin','editor'))
);

-- world_map_pins : idem
CREATE POLICY "world_map_pins_read" ON world_map_pins FOR SELECT USING (
  EXISTS (SELECT 1 FROM worlds      w WHERE w.id       = world_map_pins.world_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM world_members m WHERE m.world_id = world_map_pins.world_id AND m.user_id = auth.uid())
);

CREATE POLICY "world_map_pins_write" ON world_map_pins FOR ALL USING (
  EXISTS (SELECT 1 FROM worlds      w WHERE w.id       = world_map_pins.world_id AND w.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM world_members m WHERE m.world_id = world_map_pins.world_id AND m.user_id = auth.uid() AND m.role IN ('admin','editor'))
);

-- Index
CREATE INDEX IF NOT EXISTS idx_world_map_pins_world ON world_map_pins (world_id, sort_index);
