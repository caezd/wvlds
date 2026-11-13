-- ============================================================
-- Migration 188 — La fiche par défaut appartient au monde, pas à son propriétaire
-- ============================================================
-- Depuis les rôles (176), l'onglet Fonctionnalités des réglages s'ouvre avec
-- `world.settings` — un administrateur y voit la bascule « Fiche par défaut ».
-- Mais la politique d'insertion des modèles (054/116) exigeait encore le
-- propriétaire direct du monde : la bascule répondait « L'enregistrement a
-- échoué ». De même, un administrateur ne pouvait pas modifier les sections
-- d'un modèle créé par un autre (`can_edit_persona` = propriétaire de la
-- ligne). Le modèle suit désormais `world.settings`, comme l'onglet qui le
-- règle : création, modification, suppression, sections et champs.

CREATE OR REPLACE FUNCTION public.can_edit_persona(pid UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personas p
     WHERE p.id = pid
       AND (p.user_id = uid
            OR (p.is_npc AND public.has_world_permission(p.world_id, uid, 'npc.manage'))
            OR (p.is_template AND public.has_world_permission(p.world_id, uid, 'world.settings')))
  );
$$;

DROP POLICY IF EXISTS "personas_insert_with_capacity" ON public.personas;
CREATE POLICY "personas_insert_with_capacity" ON public.personas FOR INSERT TO authenticated WITH CHECK (
  user_id = (select auth.uid())
  AND (
    (NOT is_template AND NOT is_npc AND public.has_persona_capacity((select auth.uid()), world_id))
    OR (is_template AND world_id IS NOT NULL AND public.has_world_permission(world_id, (select auth.uid()), 'world.settings'))
    OR (is_npc AND world_id IS NOT NULL AND public.has_world_permission(world_id, (select auth.uid()), 'npc.manage'))
  )
);
DROP POLICY IF EXISTS "personas_update_own" ON public.personas;
CREATE POLICY "personas_update_own" ON public.personas FOR UPDATE TO authenticated USING (
  user_id = (select auth.uid())
  OR (is_npc AND public.has_world_permission(world_id, (select auth.uid()), 'npc.manage'))
  OR (is_template AND public.has_world_permission(world_id, (select auth.uid()), 'world.settings'))
) WITH CHECK (
  user_id = (select auth.uid())
  OR (is_npc AND public.has_world_permission(world_id, (select auth.uid()), 'npc.manage'))
  OR (is_template AND public.has_world_permission(world_id, (select auth.uid()), 'world.settings'))
);
DROP POLICY IF EXISTS "personas_delete_own" ON public.personas;
CREATE POLICY "personas_delete_own" ON public.personas FOR DELETE TO authenticated USING (
  user_id = (select auth.uid())
  OR (is_npc AND public.has_world_permission(world_id, (select auth.uid()), 'npc.manage'))
  OR (is_template AND public.has_world_permission(world_id, (select auth.uid()), 'world.settings'))
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- En tant qu'administrateur (non propriétaire) d'un monde sans modèle :
--   INSERT INTO personas (user_id, name, world_id, is_template) VALUES (auth.uid(), 'Fiche par défaut', <monde>, true) → passe.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Rejouer can_edit_persona et les trois politiques de la 182.
