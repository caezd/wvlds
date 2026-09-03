-- ============================================================
-- Migration 153 — Une épingle ouvre une autre carte
-- ============================================================
-- La migration 151 a donné plusieurs cartes à un monde ; celle-ci les relie.
-- L'épingle « Capitale » posée sur le continent ouvre le plan de la capitale :
-- c'est ce qui fait d'une pile d'images un atlas.
--
-- `ON DELETE SET NULL` : supprimer la carte de destination délie l'épingle sans
-- l'emporter. Le lieu reste sur sa carte, il ne mène simplement plus nulle part.
--
-- La contrainte interdit à une épingle de désigner SA PROPRE carte : le lien y
-- serait un bouton qui ne va nulle part, et l'interface le proposerait sans
-- raison. Rien n'empêche en revanche deux cartes de se pointer l'une l'autre —
-- un escalier se monte et se descend.
--
-- Pas de contrainte de monde entre l'épingle et sa destination : la RLS de
-- `world_map_pins` borne déjà ce qu'un éditeur peut désigner, et l'application
-- ne propose que les cartes du monde en cours.

ALTER TABLE public.world_map_pins
  ADD COLUMN IF NOT EXISTS target_map_id UUID
    REFERENCES public.world_maps(id) ON DELETE SET NULL;

ALTER TABLE public.world_map_pins
  DROP CONSTRAINT IF EXISTS world_map_pins_target_not_self;
ALTER TABLE public.world_map_pins
  ADD CONSTRAINT world_map_pins_target_not_self
    CHECK (target_map_id IS NULL OR target_map_id <> map_id);

-- Retrouver ce qui mène à une carte — pour, un jour, prévenir avant de la
-- supprimer : « trois épingles y conduisent ».
CREATE INDEX IF NOT EXISTS world_map_pins_target_idx
  ON public.world_map_pins (target_map_id)
  WHERE target_map_id IS NOT NULL;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'world_map_pins' AND column_name = 'target_map_id';

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.world_map_pins_target_idx;
-- ALTER TABLE public.world_map_pins DROP CONSTRAINT IF EXISTS world_map_pins_target_not_self;
-- ALTER TABLE public.world_map_pins DROP COLUMN IF EXISTS target_map_id;
