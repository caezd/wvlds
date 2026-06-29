-- 047_public_worlds_explore.sql
--
-- Ouvre la lecture des mondes publics à tous les utilisateurs authentifiés,
-- et fournit une fonction sécurisée pour rejoindre un monde public.

-- ── 1. Policy SELECT sur worlds ────────────────────────────────────────────
-- Tout utilisateur authentifié peut lire les mondes dont la visibilité est
-- "public". Permissive : s'ajoute aux policies existantes (membre, invité…).
CREATE POLICY worlds_select_public_visibility ON public.worlds
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (visibility = 'public');

-- ── 2. Fonction join_public_world ──────────────────────────────────────────
-- SECURITY DEFINER pour bypasser la RLS de world_members (INSERT restreint).
-- Valide que le monde est bien public avant d'insérer.
CREATE OR REPLACE FUNCTION public.join_public_world(p_world_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.worlds
    WHERE id = p_world_id
      AND visibility = 'public'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Ce monde n''est pas accessible au public.';
  END IF;

  INSERT INTO public.world_members (world_id, user_id, role)
  VALUES (p_world_id, auth.uid(), 'player')
  ON CONFLICT (world_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.join_public_world(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_public_world(UUID) TO authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS worlds_select_public_visibility ON public.worlds;
-- DROP FUNCTION IF EXISTS public.join_public_world(UUID);
