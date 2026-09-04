-- ============================================================
-- Migration 155 — L'échelle d'une carte
-- ============================================================
-- Une carte sans échelle est un dessin ; avec, elle répond à « c'est loin ? ».
-- Deux colonnes sur `world_maps` : ce que représente la LARGEUR entière de la
-- carte, et en quelle unité.
--
-- Par la largeur et non en pixels par unité : l'image est servie à plusieurs
-- largeurs selon l'écran, et un pixel n'y vaut jamais la même chose. Un
-- pourcentage de la largeur — le repère des épingles — si.
--
-- `double precision` plutôt que `numeric` : la valeur revient au client en
-- nombre, pas en chaîne, et la précision d'un flottant suffit largement à
-- « 1 200 km ».
--
-- Nulles par défaut : une carte sans échelle ne mesure rien, et l'outil de
-- mesure le dit.

ALTER TABLE public.world_maps
  ADD COLUMN IF NOT EXISTS scale_width_units DOUBLE PRECISION
    CHECK (scale_width_units IS NULL OR scale_width_units > 0),
  ADD COLUMN IF NOT EXISTS scale_unit TEXT
    CHECK (scale_unit IS NULL OR char_length(scale_unit) <= 16);

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'world_maps' AND column_name LIKE 'scale_%';
--   -- attendu : scale_width_units double precision, scale_unit text

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.world_maps
--   DROP COLUMN IF EXISTS scale_width_units,
--   DROP COLUMN IF EXISTS scale_unit;
