-- Timeline fictive par monde
-- Chaque monde peut définir un calendrier arbitraire (noms d'années, de mois)
-- et positionner une chatroom sur ce calendrier au moment de sa création.

-- 1. Colonnes sur worlds
ALTER TABLE worlds
  ADD COLUMN IF NOT EXISTS timeline_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS timeline_config  jsonb;

-- timeline_config shape:
-- {
--   "year_label":    string,          -- ex. "an"
--   "era_name":      string | null,   -- ex. "des Cendres"
--   "month_names":   string[],        -- ex. ["Milaise", "Braise", ...]  (vide = pas de mois)
--   "current_year":  number,
--   "current_month": number | null    -- index 0-based dans month_names, null si pas de mois actuel
-- }

-- 2. Colonne sur chatrooms
ALTER TABLE chatrooms
  ADD COLUMN IF NOT EXISTS timeline_date jsonb;

-- timeline_date shape:
-- {
--   "year":  number,
--   "month": number | null   -- index 0-based dans month_names du monde, null si non précisé
-- }

-- 3. RLS : timeline_config est public en lecture (membres du monde)
--    Pas de policy spécifique : les colonnes suivent les policies existantes sur worlds/chatrooms.
