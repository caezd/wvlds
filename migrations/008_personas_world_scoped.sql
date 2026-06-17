-- ============================================================
-- Migration 008 — Personas liés aux mondes
-- Ajoute world_id sur personas et adapte la limite de 5
-- personas par (user_id, world_id) plutôt que globale.
-- À exécuter dans le SQL Editor du dashboard Supabase.
-- ============================================================

-- ── 1. Colonne world_id ──────────────────────────────────────
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS world_id UUID
    REFERENCES public.worlds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_personas_user_world
  ON public.personas (user_id, world_id);

-- ── 2. Surcharge de has_persona_capacity ─────────────────────
-- L'ancienne version has_persona_capacity(uuid) reste en place
-- pour la compatibilité (personas sans monde, world_id IS NULL).
-- Nouvelle surcharge : par (user_id, world_id).
CREATE OR REPLACE FUNCTION public.has_persona_capacity(u uuid, w uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE c INT;
BEGIN
  IF public.is_subscribed(u) THEN RETURN TRUE; END IF;
  IF w IS NOT NULL THEN
    SELECT COUNT(*) INTO c FROM public.personas
      WHERE user_id = u AND world_id = w;
  ELSE
    SELECT COUNT(*) INTO c FROM public.personas
      WHERE user_id = u AND world_id IS NULL;
  END IF;
  RETURN c < 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_persona_capacity(uuid, uuid) TO anon, authenticated, service_role;

-- ── 3. Trigger mis à jour ────────────────────────────────────
-- Vérifie la capacité par monde si world_id fourni,
-- sinon retombe sur la limite globale sans monde.
CREATE OR REPLACE FUNCTION public.enforce_persona_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
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

-- ── 4. Politique RLS INSERT mise à jour ──────────────────────
DROP POLICY IF EXISTS personas_insert_with_capacity ON public.personas;

CREATE POLICY personas_insert_with_capacity ON public.personas
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_persona_capacity(auth.uid(), world_id)
  );
