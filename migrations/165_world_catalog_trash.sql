-- ============================================================
-- Migration 165 — Corbeille du catalogue
-- ============================================================
-- Supprimer un objet du catalogue était irréversible, et le dégât dépassait la
-- ligne effacée : toutes les fiches qui le portaient gardaient un `catalog_id`
-- ne désignant plus rien. Depuis la migration 161 elles l'affichent comme
-- « retiré du catalogue » au lieu de mentir — c'est mieux que le fantôme
-- d'avant, mais ça ne rend toujours pas l'objet.
--
-- Un objet supprimé est désormais MARQUÉ (`deleted_at`) et non retiré. Le
-- restaurer rend leur objet à toutes les fiches d'un coup, sans qu'aucune ait
-- à être retouchée : elles n'ont jamais cessé de le désigner.
--
-- Même forme que la corbeille du wiki (migration 149), pour que le dépôt n'ait
-- qu'un seul modèle de suppression réversible.
--
-- ── Qui voit la corbeille ──
-- Les éditeurs seuls. Pour un simple membre, un objet supprimé n'existe pas —
-- il disparaît du catalogue et du sélecteur de sa fiche.
--
-- Attention, côté application : un éditeur, lui, LIT les objets supprimés.
-- Les requêtes qui construisent le catalogue pour l'AFFICHAGE D'UNE FICHE
-- doivent donc filtrer `deleted_at IS NULL` explicitement, sans quoi un
-- éditeur verrait un objet supprimé s'afficher normalement là où tout le monde
-- voit « retiré du catalogue ». Seule la corbeille demande les lignes marquées.

ALTER TABLE public.world_catalog_items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- La corbeille se liste par monde, et seules les lignes marquées l'intéressent :
-- un index partiel tient dans presque rien et sert exactement cette lecture.
CREATE INDEX IF NOT EXISTS world_catalog_items_trash_idx
  ON public.world_catalog_items (world_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

DROP POLICY IF EXISTS "world_catalog_items_read" ON public.world_catalog_items;
CREATE POLICY "world_catalog_items_read" ON public.world_catalog_items FOR SELECT USING (
  -- Propriétaire et éditeurs : tout, corbeille comprise.
  EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_catalog_items.world_id AND w.owner_id = (select auth.uid()))
  OR EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_catalog_items.world_id AND m.user_id = (select auth.uid()) AND m.role IN ('admin', 'editor'))
  -- Membres : le catalogue vivant, et lui seul.
  OR (
    deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = world_catalog_items.world_id AND m.user_id = (select auth.uid()))
  )
);

-- ── Purge automatique, avec la même réserve qu'au wiki ───────
-- Trente jours après sa suppression, un objet est retiré pour de bon — mais
-- SEULEMENT si son dossier d'image est vide. Effacer une ligne de
-- `storage.objects` depuis SQL laisse le fichier lui-même dans le stockage,
-- payé et orphelin : seule l'API de stockage retire les deux. Les objets qui
-- ont encore une image restent donc en corbeille, où un éditeur peut les
-- supprimer définitivement depuis l'application, qui fait le ménage.
--
-- `cron.schedule` sur un nom existant le remplace : rejouer la migration ne
-- crée pas de doublon.
SELECT cron.schedule(
  'purge-catalog-trash',
  '30 3 * * *',
  $$
  DELETE FROM public.world_catalog_items i
  WHERE i.deleted_at < now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'worlds'
        AND o.name LIKE 'world-' || i.world_id::text || '/item-' || i.id::text || '/%'
    )
  $$
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'purge-catalog-trash';
--   Sous l'identité d'un membre non éditeur, un objet marqué doit disparaître
--   d'un SELECT ; sous celle d'un éditeur, rester visible.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- SELECT cron.unschedule('purge-catalog-trash');
-- (rétablir la policy world_catalog_items_read de la migration 161)
-- DROP INDEX IF EXISTS public.world_catalog_items_trash_idx;
-- ALTER TABLE public.world_catalog_items DROP COLUMN IF EXISTS deleted_at;
