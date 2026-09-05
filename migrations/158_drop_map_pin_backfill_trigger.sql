-- ============================================================
-- Migration 158 — Retrait du filet de la migration 152
-- ============================================================
-- Le déclencheur `world_map_pins_default_map` comblait `map_id` pour le code
-- de production d'avant les cartes multiples, qui insérait une épingle avec
-- le seul `world_id`. Ce code n'est plus en ligne : le client pose toujours
-- `map_id` (voir `createMapPin`), et la contrainte `NOT NULL` de la migration
-- 151 suffit à garder l'invariant.
--
-- Le garder aurait masqué une régression : une insertion sans carte serait
-- passée en silence, rattachée à la première carte du monde — pas forcément
-- la bonne.

DROP TRIGGER IF EXISTS world_map_pins_default_map ON public.world_map_pins;
DROP FUNCTION IF EXISTS public.world_map_pin_default_map();

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.world_map_pins'::regclass
--      AND NOT tgisinternal;
--   -- attendu : aucune ligne

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Rejouer la migration 152.
