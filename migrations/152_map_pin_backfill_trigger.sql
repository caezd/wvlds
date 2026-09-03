-- ============================================================
-- Migration 152 — Filet temporaire : `map_id` déduit à l'insertion
-- ============================================================
-- TEMPORAIRE. À supprimer une fois la branche `feature/map-improvements`
-- déployée — le rollback en bas de ce fichier suffit.
--
-- La migration 151 a rendu `world_map_pins.map_id` obligatoire, mais la
-- production tourne encore sur le code d'avant, qui insère une épingle avec le
-- seul `world_id`. Entre l'application de 151 et le déploiement, poser une
-- épingle depuis l'application en ligne échoue :
--
--   null value in column "map_id" violates not-null constraint
--
-- Deux façons de refermer la fenêtre. Relâcher `NOT NULL` laisserait entrer de
-- vraies épingles orphelines, qu'il faudrait ensuite rattacher à la main. Ce
-- déclencheur, lui, garde l'invariant : une insertion sans carte est complétée
-- par la première carte du monde — celle que l'ancien code affichait, puisqu'il
-- n'en connaissait qu'une.
--
-- Un monde sans aucune carte ne peut pas produire d'épingle : l'ancien code
-- n'offrait le clic de pose qu'une fois l'image importée, donc la carte créée.
-- Si cela arrivait malgré tout, l'insertion échoue comme avant — ce qui est
-- préférable à une épingle sans toit.

CREATE OR REPLACE FUNCTION public.world_map_pin_default_map()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.map_id IS NULL THEN
    SELECT m.id INTO NEW.map_id
      FROM public.world_maps m
     WHERE m.world_id = NEW.world_id
     ORDER BY m.sort_index, m.created_at
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS world_map_pins_default_map ON public.world_map_pins;
CREATE TRIGGER world_map_pins_default_map
  BEFORE INSERT ON public.world_map_pins
  FOR EACH ROW
  EXECUTE FUNCTION public.world_map_pin_default_map();

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.world_map_pins'::regclass
--      AND NOT tgisinternal;

-- ── ROLLBACK — à jouer APRÈS le déploiement ──────────────────
-- DROP TRIGGER IF EXISTS world_map_pins_default_map ON public.world_map_pins;
-- DROP FUNCTION IF EXISTS public.world_map_pin_default_map();
