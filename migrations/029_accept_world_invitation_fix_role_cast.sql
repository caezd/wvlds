-- Fix: caster role TEXT → world_role (enum) lors de l'insertion dans world_members
CREATE OR REPLACE FUNCTION public.accept_world_invitation(p_world_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_role
  FROM public.world_invitations
  WHERE world_id = p_world_id
    AND invitee_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Aucune invitation en attente pour ce monde.';
  END IF;

  INSERT INTO public.world_members (world_id, user_id, role)
  VALUES (p_world_id, auth.uid(), v_role::world_role)
  ON CONFLICT (world_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  DELETE FROM public.world_invitations
  WHERE world_id = p_world_id
    AND invitee_id = auth.uid();
END;
$$;
