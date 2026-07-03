-- ============================================================
-- Migration 052 — Corrige has_persona_capacity(uuid, uuid)
-- La fonction utilisait public.is_subscribed(u), basée sur
-- profiles.is_subscribed (colonne booléenne désynchronisée de
-- profiles.plan — des comptes lifetime avaient is_subscribed=false).
-- On aligne sur public.is_user_subscribed(u), déjà utilisée pour
-- le quota des mondes (basée sur profiles.plan).
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_persona_capacity(u uuid, w uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE c INT;
BEGIN
  IF public.is_user_subscribed(u) THEN RETURN TRUE; END IF;
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
