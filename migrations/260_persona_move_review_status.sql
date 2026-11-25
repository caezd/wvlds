-- ============================================================
-- Migration 260 — Déplacer un persona vers un autre monde refonctionne
-- ============================================================
-- BOGUE CORRIGÉ (préexistant depuis la migration 182, constaté en rejouant
-- l'audit du 2026-11-25).
--
-- `tg_personas_review_guard` est SECURITY INVOKER — il lui faut
-- `current_user` pour distinguer une écriture du client d'une fonction de la
-- base. Mais quand le monde change, il recalcule le statut de validation par
-- `persona_initial_review_status`, que la migration 182 a retirée à
-- `authenticated`. Résultat : tout déplacement de persona depuis
-- l'application (« Déplacer vers… ») échouait sur
-- « permission denied for function persona_initial_review_status ».
--
-- Correctif : le garde ne fait plus que garder ; le recalcul passe dans un
-- trigger SECURITY DEFINER distinct, qui s'exécute après lui (ordre
-- alphabétique des triggers BEFORE : review_guard < review_move). La
-- fonction de calcul reste fermée aux clients.

CREATE OR REPLACE FUNCTION public.tg_personas_review_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.review_status IS DISTINCT FROM OLD.review_status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.sheet_complete IS DISTINCT FROM OLD.sheet_complete THEN
      RAISE EXCEPTION 'La validation d''une fiche passe par submit_persona_for_review / review_persona.';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.is_npc IS DISTINCT FROM OLD.is_npc THEN
      RAISE EXCEPTION 'Le propriétaire et la nature (PNJ) d''un persona ne changent pas.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Changer de monde, c'est repartir de la validation que ce monde impose.
CREATE OR REPLACE FUNCTION public.tg_personas_review_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.world_id IS DISTINCT FROM OLD.world_id THEN
    NEW.review_status := public.persona_initial_review_status(NEW.world_id, NEW.user_id, NEW.is_template, NEW.is_npc);
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.sheet_complete := NEW.is_template OR NEW.world_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.personas t
        JOIN public.persona_sections ts ON ts.persona_id = t.id
        JOIN public.persona_section_fields tf ON tf.section_id = ts.id AND tf.required
       WHERE t.world_id = NEW.world_id AND t.is_template AND t.deleted_at IS NULL);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_personas_review_move() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_personas_review_move ON public.personas;
CREATE TRIGGER trg_personas_review_move
  BEFORE UPDATE OF world_id ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.tg_personas_review_move();
