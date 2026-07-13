-- 087_world_age_restriction.sql
--
-- Permet de marquer un monde comme réservé aux 18 ans et plus. Un nouveau
-- membre doit confirmer son âge pour pouvoir rejoindre un tel monde ; les
-- membres déjà présents devront confirmer à leur prochaine visite si le
-- monde devient 18+ après coup.
--
-- Note : `join_public_world` n'existait pas encore côté base (la migration
-- 047 n'avait jamais été appliquée) — le bouton « Rejoindre » de /explore
-- échouait silencieusement. Cette migration la crée, avec la vérification
-- d'âge intégrée dès le départ.

ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS is_age_restricted boolean NOT NULL DEFAULT false;
ALTER TABLE public.world_members ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz;

-- ── join_public_world ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.join_public_world(UUID);

CREATE OR REPLACE FUNCTION public.join_public_world(p_world_id UUID, p_age_confirmed boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_age_restricted boolean;
BEGIN
  SELECT is_age_restricted INTO v_age_restricted
  FROM public.worlds
  WHERE id = p_world_id
    AND visibility = 'public'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce monde n''est pas accessible au public.';
  END IF;

  IF v_age_restricted AND NOT p_age_confirmed THEN
    RAISE EXCEPTION 'Confirmation d''âge requise pour rejoindre ce monde.';
  END IF;

  INSERT INTO public.world_members (world_id, user_id, role, age_confirmed_at)
  VALUES (p_world_id, auth.uid(), 'player', CASE WHEN v_age_restricted THEN now() ELSE NULL END)
  ON CONFLICT (world_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.join_public_world(UUID, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_public_world(UUID, boolean) TO authenticated;

-- ── accept_world_invitation ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.accept_world_invitation(UUID);

CREATE OR REPLACE FUNCTION public.accept_world_invitation(p_world_id UUID, p_age_confirmed boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_age_restricted boolean;
BEGIN
  SELECT role::TEXT INTO v_role
  FROM public.world_invitations
  WHERE world_id = p_world_id
    AND invitee_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Aucune invitation en attente pour ce monde.';
  END IF;

  SELECT is_age_restricted INTO v_age_restricted
  FROM public.worlds
  WHERE id = p_world_id;

  IF v_age_restricted AND NOT p_age_confirmed THEN
    RAISE EXCEPTION 'Confirmation d''âge requise pour rejoindre ce monde.';
  END IF;

  INSERT INTO public.world_members (world_id, user_id, role, age_confirmed_at)
  VALUES (p_world_id, auth.uid(), v_role::world_role, CASE WHEN v_age_restricted THEN now() ELSE NULL END)
  ON CONFLICT (world_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  DELETE FROM public.world_invitations
  WHERE world_id = p_world_id
    AND invitee_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.accept_world_invitation(UUID, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_world_invitation(UUID, boolean) TO authenticated;

-- ── confirm_world_age ──────────────────────────────────────────────────────
-- Pour les membres déjà présents dans le monde (propriétaire, membres
-- ajoutés avant l'activation du 18+) qui doivent confirmer à leur prochaine
-- visite, hors flux de jointure.
CREATE OR REPLACE FUNCTION public.confirm_world_age(p_world_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.world_members
  SET age_confirmed_at = now()
  WHERE world_id = p_world_id
    AND user_id = auth.uid()
    AND age_confirmed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vous n''êtes pas membre de ce monde.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_world_age(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_world_age(UUID) TO authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.confirm_world_age(UUID);
-- DROP FUNCTION IF EXISTS public.accept_world_invitation(UUID, boolean);
-- DROP FUNCTION IF EXISTS public.join_public_world(UUID, boolean);
-- ALTER TABLE public.world_members DROP COLUMN IF EXISTS age_confirmed_at;
-- ALTER TABLE public.worlds DROP COLUMN IF EXISTS is_age_restricted;
