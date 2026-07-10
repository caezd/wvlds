-- 079_world_avatar_type_default_off.sql
--
-- Les cases "avatars réels" / "avatars illustrés" ne doivent rien présumer :
-- décochées par défaut pour les nouveaux mondes, et remises à false pour
-- tous les mondes existants (qui avaient hérité de true à la création de la
-- colonne dans 078_world_tags_and_avatar_type.sql).

ALTER TABLE worlds ALTER COLUMN allows_real_avatars SET DEFAULT false;
ALTER TABLE worlds ALTER COLUMN allows_illustrated_avatars SET DEFAULT false;

UPDATE worlds SET allows_real_avatars = false, allows_illustrated_avatars = false
  WHERE allows_real_avatars IS DISTINCT FROM false OR allows_illustrated_avatars IS DISTINCT FROM false;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- ALTER TABLE worlds ALTER COLUMN allows_real_avatars SET DEFAULT true;
-- ALTER TABLE worlds ALTER COLUMN allows_illustrated_avatars SET DEFAULT true;
-- UPDATE worlds SET allows_real_avatars = true, allows_illustrated_avatars = true;
