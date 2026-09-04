-- ============================================================
-- Migration 151 — Plusieurs cartes par monde
-- ============================================================
-- Un monde n'avait droit qu'à une carte : `UNIQUE (world_id)` sur
-- `world_maps`. Un monde en a pourtant souvent plusieurs — le continent, la
-- capitale, l'intérieur d'un donjon — et il fallait jusqu'ici remplacer l'image
-- pour passer de l'une à l'autre, en perdant les épingles de la précédente.
--
-- Le point délicat n'est pas la contrainte d'unicité mais les ÉPINGLES : elles
-- sont rattachées au MONDE, pas à une carte. Telles quelles, les épingles du
-- continent se seraient affichées sur le plan du donjon. D'où `map_id`, avec
-- rattachement des épingles existantes à l'unique carte de leur monde — sans
-- quoi elles perdraient leur toit.
--
-- `world_id` est conservé sur les deux tables : les politiques RLS des
-- migrations 019 et 020 s'appuient dessus, et les réécrire pour remonter à la
-- carte n'apporterait rien qu'un risque.
--
-- `ON DELETE CASCADE` sur `map_id` : supprimer une carte emporte ses lieux,
-- qui n'ont pas de sens ailleurs. Les salons qui pointaient sur ces lieux
-- gardent leur place — `chatrooms.map_pin_id` est déjà en `ON DELETE SET NULL`.
--
-- Vérifié avant d'écrire ceci : 2 cartes, 2 épingles, aucune orpheline. Le
-- rattachement ne laisse donc rien derrière lui, et la contrainte `NOT NULL`
-- peut suivre dans la foulée.

-- ── Plusieurs cartes, ordonnées ──────────────────────────────
ALTER TABLE public.world_maps
  DROP CONSTRAINT IF EXISTS world_maps_world_id_key;

ALTER TABLE public.world_maps
  ADD COLUMN IF NOT EXISTS sort_index INTEGER NOT NULL DEFAULT 0;

-- L'ordre des onglets, et la liste des cartes d'un monde.
CREATE INDEX IF NOT EXISTS world_maps_world_idx
  ON public.world_maps (world_id, sort_index);

-- ── Chaque épingle appartient à une carte ────────────────────
ALTER TABLE public.world_map_pins
  ADD COLUMN IF NOT EXISTS map_id UUID
    REFERENCES public.world_maps(id) ON DELETE CASCADE;

UPDATE public.world_map_pins p
   SET map_id = m.id
  FROM public.world_maps m
 WHERE m.world_id = p.world_id
   AND p.map_id IS NULL;

ALTER TABLE public.world_map_pins
  ALTER COLUMN map_id SET NOT NULL;

-- Les épingles d'une carte, dans leur ordre.
CREATE INDEX IF NOT EXISTS world_map_pins_map_idx
  ON public.world_map_pins (map_id, sort_index);

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT count(*) FILTER (WHERE map_id IS NULL) AS orphelines,
--          count(*) AS epingles
--     FROM public.world_map_pins;
--   -- attendu : orphelines = 0

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.world_map_pins_map_idx;
-- ALTER TABLE public.world_map_pins DROP COLUMN IF EXISTS map_id;
-- DROP INDEX IF EXISTS public.world_maps_world_idx;
-- ALTER TABLE public.world_maps DROP COLUMN IF EXISTS sort_index;
-- -- Ne se rétablit que si chaque monde n'a plus qu'une carte :
-- ALTER TABLE public.world_maps ADD CONSTRAINT world_maps_world_id_key UNIQUE (world_id);
