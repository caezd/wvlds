-- ============================================================
-- Migration 056 — Quota de personas appliqué aussi au déplacement
-- Le trigger trg_enforce_persona_limit ne couvrait que l'INSERT :
-- movePersona (UPDATE de world_id) ne reposait que sur un pré-check
-- applicatif (RPC has_persona_capacity) séparé de l'UPDATE — deux
-- déplacements concurrents vers un monde à 4/5 pouvaient tous deux
-- passer et dépasser la limite du plan gratuit (TOCTOU).
-- La fonction gère désormais INSERT et UPDATE de world_id, avec le
-- même verrou consultatif par utilisateur pour sérialiser les checks.
-- À exécuter dans le SQL Editor du dashboard Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_persona_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_template THEN RETURN NEW; END IF;
  -- Sur UPDATE, seul un changement de monde re-déclenche le contrôle.
  IF TG_OP = 'UPDATE' AND NEW.world_id IS NOT DISTINCT FROM OLD.world_id THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(NEW.user_id::text), 1, 16))::bit(64)::bigint
  );
  IF NOT public.has_persona_capacity(NEW.user_id, NEW.world_id) THEN
    RAISE EXCEPTION 'Persona limit reached: free users may create at most 5 personas per world'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_persona_limit_move ON public.personas;
CREATE TRIGGER trg_enforce_persona_limit_move
  BEFORE UPDATE OF world_id ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_persona_limit();
