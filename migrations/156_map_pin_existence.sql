-- ============================================================
-- Migration 156 — Les lieux dans le temps
-- ============================================================
-- Une ville fondée en l'an 1200 n'a rien à faire sur la carte de l'an 800,
-- et une forteresse rasée non plus sur celle d'après. Chaque lieu prend deux
-- bornes : depuis quand il existe, et jusqu'à quand. La carte affiche une
-- époque, et estompe ce qui n'y est pas.
--
-- La même forme JSON que `chatrooms.timeline_date` (migration 040) :
-- `{year, month, day}`, mois et jour pouvant être nuls — « l'an 1200 »
-- suffit souvent. Nulles = de toujours à toujours.
--
-- Deux colonnes JSONB plutôt qu'une table d'états : un lieu naît une fois et
-- disparaît une fois. Le jour où une ville est détruite puis rebâtie, on
-- reparlera d'une table.

ALTER TABLE public.world_map_pins
  ADD COLUMN IF NOT EXISTS exists_from JSONB,
  ADD COLUMN IF NOT EXISTS exists_until JSONB;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'world_map_pins' AND column_name LIKE 'exists_%';
--   -- attendu : exists_from jsonb, exists_until jsonb

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.world_map_pins
--   DROP COLUMN IF EXISTS exists_from,
--   DROP COLUMN IF EXISTS exists_until;
