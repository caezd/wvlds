-- 084_persona_spouse_same_world_check.sql
--
-- La FK spouse_persona_id (migration 083) ne garantissait ni que le
-- conjoint appartienne au même monde, ni qu'un persona ne se pointe
-- pas lui-même : une mise à jour hors UI pouvait créer des données
-- incohérentes. Un CHECK constraint ne peut pas faire de lookup
-- cross-row, d'où le trigger pour la contrainte "même monde".

ALTER TABLE personas ADD CONSTRAINT personas_spouse_not_self
  CHECK (spouse_persona_id IS NULL OR spouse_persona_id <> id);

CREATE OR REPLACE FUNCTION public.enforce_spouse_same_world()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.spouse_persona_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.personas
    WHERE id = NEW.spouse_persona_id AND world_id IS NOT DISTINCT FROM NEW.world_id
  ) THEN
    RAISE EXCEPTION 'spouse_persona_id must reference a persona in the same world'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_spouse_same_world ON public.personas;
CREATE TRIGGER trg_enforce_spouse_same_world
  BEFORE INSERT OR UPDATE OF spouse_persona_id, world_id ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_spouse_same_world();

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_enforce_spouse_same_world ON public.personas;
-- DROP FUNCTION IF EXISTS public.enforce_spouse_same_world();
-- ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_spouse_not_self;
