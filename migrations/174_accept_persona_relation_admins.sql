-- ============================================================
-- Migration 174 — Un admin du monde peut accepter une demande de relation
-- ============================================================
-- La 173 laissait un propriétaire ou un admin du monde CRÉER une relation
-- réciproque acceptée d'emblée, au nom de n'importe quel persona — mais sa RPC
-- d'acceptation ne reconnaissait que le joueur du persona visé. L'écran, lui,
-- suivait la première règle et proposait « Accepter » aux admins : relevé en
-- prod le 2026-09-13, « Vous ne pouvez pas répondre à cette demande » sur un
-- compte admin. Même règle partout : le joueur visé, le propriétaire, un admin.

CREATE OR REPLACE FUNCTION public.accept_persona_relation(p_relation_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_to    UUID;
  v_world UUID;
BEGIN
  SELECT to_persona_id, world_id INTO v_to, v_world FROM public.persona_relations
   WHERE id = p_relation_id AND status = 'pending';
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Demande introuvable ou déjà traitée.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (
    public.owns_persona(v_to, auth.uid())
    OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = v_world AND w.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = v_world AND wm.user_id = auth.uid() AND wm.role = 'admin'::world_role)
  ) THEN
    RAISE EXCEPTION 'Vous ne pouvez pas répondre à cette demande.' USING ERRCODE = 'P0001';
  END IF;
  -- Le déclencheur d'acceptation fait le reste : miroir, fiches.
  UPDATE public.persona_relations SET status = 'accepted' WHERE id = p_relation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_persona_relation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_persona_relation(UUID) TO authenticated;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT has_function_privilege('anon', 'public.accept_persona_relation(uuid)', 'EXECUTE');  -- → false

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Recréer la fonction telle qu'en 173 (joueur visé seulement).
