-- 081_restore_worlds_public_visibility_policy.sql
--
-- La policy SELECT autorisant la lecture d'un monde `visibility = 'public'`
-- (créée dans 047_public_worlds_explore.sql) avait disparu de la base en
-- production — vraisemblablement écrasée par une consolidation RLS
-- ultérieure non tracée en migration (seule `worlds_select_public_merged`,
-- issue de 039, subsistait — elle ne couvre que persona/invitation, pas la
-- visibilité publique). Conséquence : /explore restait vide pour tout
-- utilisateur n'étant ni owner, ni membre, ni persona, ni invité d'aucun
-- monde public. On la restaure ici.

DROP POLICY IF EXISTS worlds_select_public_visibility ON worlds;

CREATE POLICY worlds_select_public_visibility ON worlds
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (visibility = 'public');

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS worlds_select_public_visibility ON worlds;
