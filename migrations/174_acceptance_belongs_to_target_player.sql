-- ============================================================
-- Migration 174 — L'acceptation n'appartient qu'au joueur du persona visé
-- ============================================================
-- La 173 laissait un propriétaire ou un admin du monde créer une relation
-- réciproque ACCEPTÉE D'EMBLÉE vers le persona d'un autre joueur, comme s'il
-- avait répondu à sa place. Décision : un admin n'interagit pas avec les
-- acceptations. Une relation réciproque vers un persona qu'on ne possède pas
-- naît en attente, quel que soit le rôle de celui qui la crée ; seul le joueur
-- du persona visé la confirme (ou la refuse). Les admins gardent le reste —
-- créer, retyper, supprimer.
--
-- Deux endroits portaient l'exception : la politique d'écriture (INSERT et
-- UPDATE, clause « acceptée d'emblée ») et la RPC d'acceptation. Les deux sont
-- réécrites sans elle.

DROP POLICY IF EXISTS "players_create_relations" ON public.persona_relations;
CREATE POLICY "players_create_relations" ON public.persona_relations
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND (
      public.owns_persona(from_persona_id, (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = persona_relations.world_id AND w.owner_id = (select auth.uid()))
      OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = persona_relations.world_id AND wm.user_id = (select auth.uid()) AND wm.role = 'admin'::world_role)
    )
    -- En attente : seulement pour un type réciproque, il n'y a rien à accepter sinon.
    AND (status = 'accepted' OR public.relation_type_is_mutual(type))
    -- Acceptée d'emblée : un type à sens unique, ou un persona visé à soi.
    AND (
      status = 'pending'
      OR NOT public.relation_type_is_mutual(type)
      OR public.owns_persona(to_persona_id, (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "players_update_relations" ON public.persona_relations;
CREATE POLICY "players_update_relations" ON public.persona_relations
  FOR UPDATE TO authenticated
  USING (
    public.owns_persona(from_persona_id, (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = persona_relations.world_id AND w.owner_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = persona_relations.world_id AND wm.user_id = (select auth.uid()) AND wm.role = 'admin'::world_role)
  )
  WITH CHECK (
    (status = 'accepted' OR public.relation_type_is_mutual(type))
    AND (
      status = 'pending'
      OR NOT public.relation_type_is_mutual(type)
      OR public.owns_persona(to_persona_id, (select auth.uid()))
    )
  );

CREATE OR REPLACE FUNCTION public.accept_persona_relation(p_relation_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_to UUID;
BEGIN
  SELECT to_persona_id INTO v_to FROM public.persona_relations
   WHERE id = p_relation_id AND status = 'pending';
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Demande introuvable ou déjà traitée.' USING ERRCODE = 'P0001';
  END IF;
  -- Le joueur du persona visé, et personne d'autre — pas même un admin.
  IF NOT public.owns_persona(v_to, auth.uid()) THEN
    RAISE EXCEPTION 'Vous ne pouvez pas répondre à cette demande.' USING ERRCODE = 'P0001';
  END IF;
  -- Le déclencheur d'acceptation fait le reste : miroir, fiches.
  UPDATE public.persona_relations SET status = 'accepted' WHERE id = p_relation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_persona_relation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_persona_relation(UUID) TO authenticated;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT with_check FROM pg_policies WHERE policyname = 'players_create_relations';
--   -- attendu : plus de clause worlds/world_members dans le dernier bloc
-- SELECT has_function_privilege('anon', 'public.accept_persona_relation(uuid)', 'EXECUTE');  -- → false

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Recréer les deux politiques et la fonction telles qu'en 173.
