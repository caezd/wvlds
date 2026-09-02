-- ============================================================
-- Migration 149 — Corbeille des pages de wiki
-- ============================================================
-- Supprimer une page était irréversible : `DELETE` dur, cascade sur toute la
-- descendance, et depuis la migration 148 le dossier d'images de chaque page
-- emportée est vidé dans la foulée. Supprimer un dossier de trente pages par
-- erreur, c'était trente articles, leurs fiches, leurs commentaires et leurs
-- illustrations — sans retour.
--
-- Une page supprimée est désormais MARQUÉE (`deleted_at`) et non retirée. Ses
-- fiches, commentaires et images restent en place, intacts, jusqu'à ce qu'un
-- éditeur la restaure ou la supprime pour de bon.
--
-- ── Qui voit la corbeille ──
-- Les éditeurs seuls. La policy de lecture des membres gagne `deleted_at IS
-- NULL` : pour un lecteur, une page supprimée n'existe pas, ni dans l'arbre, ni
-- par son adresse, ni par un lien `[[…]]` qui la visait. Les éditeurs, eux,
-- continuent de tout voir — c'est ce qui leur permet de restaurer.
--
-- Les tables satellites (fiches, catégories, annotations) délèguent déjà leur
-- lecture à cette policy par un EXISTS sur la page : elles disparaissent pour
-- les lecteurs avec elle, sans qu'on les touche.

ALTER TABLE public.world_wiki_pages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- La corbeille se liste par monde, et seules les pages marquées l'intéressent :
-- un index partiel tient dans presque rien et sert exactement cette lecture.
CREATE INDEX IF NOT EXISTS wwp_trash_idx
  ON public.world_wiki_pages (world_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

DROP POLICY IF EXISTS wwp_select ON public.world_wiki_pages;
CREATE POLICY wwp_select ON public.world_wiki_pages
  FOR SELECT
  USING (
    is_world_editor(world_id, (select auth.uid()))
    OR (
      is_world_member(world_id, (select auth.uid()))
      AND deleted_at IS NULL
      AND (is_folder OR published_at IS NOT NULL)
      AND NOT wwp_is_restricted(id)
    )
  );

-- ── Purge automatique, avec une réserve ──────────────────────
-- Trente jours après sa suppression, une page est retirée pour de bon — mais
-- SEULEMENT si son dossier d'images est vide. Effacer une ligne de
-- `storage.objects` depuis SQL laisse le fichier lui-même dans le stockage,
-- payé et orphelin : seule l'API de stockage retire les deux. Les pages qui ont
-- encore des images restent donc dans la corbeille, où un éditeur peut les
-- supprimer pour de bon depuis l'application, qui fait le ménage correctement.
--
-- `cron.schedule` sur un nom existant le remplace : rejouer la migration ne
-- crée pas de doublon.
SELECT cron.schedule(
  'purge-wiki-trash',
  '15 3 * * *',
  $$
  DELETE FROM public.world_wiki_pages p
  WHERE p.deleted_at < now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'wiki'
        AND o.name LIKE 'world-' || p.world_id::text || '/page-' || p.id::text || '/%'
    )
  $$
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'purge-wiki-trash';
--   Sous l'identité d'un membre non éditeur, une page marquée doit disparaître
--   d'un SELECT ; sous celle d'un éditeur, rester visible.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- SELECT cron.unschedule('purge-wiki-trash');
-- (rétablir la policy wwp_select sans la condition sur deleted_at)
-- DROP INDEX IF EXISTS public.wwp_trash_idx;
-- ALTER TABLE public.world_wiki_pages DROP COLUMN IF EXISTS deleted_at;
