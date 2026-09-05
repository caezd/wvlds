-- ============================================================
-- Migration 163 — Le bucket `worlds` accepte les dossiers `item-…`
-- ============================================================
-- Un objet du catalogue peut désormais porter une image propre au monde, à la
-- place d'une icône du jeu `rpg_icons`. Elle se range comme le reste :
--
--   world-<id>/item-<id>/<uuid>.webp
--
-- La policy d'écriture posée par la migration 159 n'admet que `map-` et
-- `pin-` ; elle est réécrite avec `item-`. Rien d'autre ne change — même
-- vérification d'éditeur, même exigence de forme complète du chemin, qui
-- garantit que le `substring` rend un UUID valide.
--
-- La policy de suppression, elle, n'a jamais regardé que `world-<id>/` : elle
-- couvre déjà les nouveaux dossiers, et n'est pas retouchée.
--
-- Rappel des migrations 127, 148 et 159 : `objects.name` doit être qualifié.
-- Sans cela le `name` se résout vers une table métier et la policy bloque tout.

DROP POLICY IF EXISTS "worlds: map editors write" ON storage.objects;

CREATE POLICY "worlds: map editors write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'worlds'
    AND objects.name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(map|pin|item)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND public.is_world_editor(
      (substring(objects.name, '^world-([0-9a-fA-F-]{36})/'))::uuid,
      (select auth.uid())
    )
  );

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT with_check FROM pg_policies
--    WHERE schemaname='storage' AND tablename='objects'
--      AND policyname='worlds: map editors write';
--   -- attendu : le motif contient (map|pin|item)

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Réappliquer la policy de la migration 159, sans `item`.
