-- Activation individuelle des objets et compétences par monde
-- enable_* = la fonctionnalité est active pour ce monde
-- restrict_* (existant) = sous-option : restreindre au catalogue

ALTER TABLE worlds
  ADD COLUMN IF NOT EXISTS enable_inventory BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enable_skills    BOOLEAN NOT NULL DEFAULT TRUE;
