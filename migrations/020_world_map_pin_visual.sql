-- Champs visuels des pins de carte
ALTER TABLE world_map_pins
  ADD COLUMN IF NOT EXISTS icon        TEXT NOT NULL DEFAULT 'map-pin',
  ADD COLUMN IF NOT EXISTS icon_color  TEXT NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS border_color TEXT,
  ADD COLUMN IF NOT EXISTS border_style TEXT NOT NULL DEFAULT 'solid';
