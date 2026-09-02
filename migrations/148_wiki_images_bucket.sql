-- ============================================================
-- Migration 148 — Un espace de stockage pour les images du wiki
-- ============================================================
-- Les images d'un article partaient dans le bucket `worlds`, sous
-- `user-<id compte>/world-<id monde>/wiki-<uuid>.webp`. Deux conséquences que
-- ce rangement rendait inévitables :
--
--   1. Les images d'une même page sont éparpillées dans le dossier de CHAQUE
--      rédacteur qui en a posé une. Rien ne les rassemble, donc rien ne dit ce
--      qui appartient à une page supprimée : ces fichiers restent, payés et
--      invisibles, sans qu'on puisse même les compter.
--   2. Les policies du bucket `worlds` sont strictement `user-<uid>/%`. Un
--      propriétaire de monde ne peut donc pas effacer une image posée par un
--      autre rédacteur dans SON monde — pas même en supprimant la page.
--
-- D'où un espace à part, rangé par ce qui possède réellement les fichiers :
--
--   wiki    world-<id monde>/page-<id page>/<uuid>.webp
--
-- Le dossier d'une page devient l'unité de ménage : supprimer la page, c'est
-- vider un préfixe. Et l'on peut, à tout moment, comparer les préfixes
-- présents aux pages existantes pour retrouver ce qui traîne.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wiki',
  'wiki',
  -- Public comme les autres espaces d'images : un article se lit, et ses
  -- illustrations avec. Le secret tient au nom de fichier (voir
  -- `lib/storagePaths.ts`), pas à une URL signée.
  true,
  10485760,
  ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Le piège de la colonne `name` ────────────────────────────
-- Rappel de la migration 127 : `storage.objects` et plusieurs tables métier
-- portent toutes deux une colonne `name`. Sans qualification, un
-- `substring(name, …)` écrit dans un EXISTS se résout vers la table interrogée
-- et la condition ne peut jamais être vraie — la policy bloque alors tout le
-- monde, éditeurs compris. D'où `objects.name` partout, même ici où
-- `world_wiki_pages` n'a pas de colonne `name` : la table peut en gagner une.

DROP POLICY IF EXISTS "wiki: public read"     ON storage.objects;
DROP POLICY IF EXISTS "wiki: editors write"   ON storage.objects;
DROP POLICY IF EXISTS "wiki: editors delete"  ON storage.objects;

CREATE POLICY "wiki: public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'wiki');

-- ── Écriture : éditeur du monde, ET page appartenant à ce monde ──
-- La seconde condition ne protège de rien qu'on ne puisse déjà faire — un
-- éditeur écrit dans son propre monde de toute façon — mais elle garde le
-- rangement honnête : un dossier `page-<id>` contient bien les images de CETTE
-- page, et le ménage peut s'y fier.
CREATE POLICY "wiki: editors write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'wiki'
    AND objects.name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/page-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND EXISTS (
      SELECT 1 FROM public.world_wiki_pages p
      WHERE p.id = (substring(objects.name, '/page-([0-9a-fA-F-]{36})/'))::uuid
        AND p.world_id = (substring(objects.name, '^world-([0-9a-fA-F-]{36})/'))::uuid
        AND public.is_world_editor(p.world_id, (select auth.uid()))
    )
  );

-- ── Suppression : le MONDE, et lui seul ──────────────────────
-- Surtout pas de condition sur la page : le ménage a lieu quand la page vient
-- d'être supprimée, donc quand la ligne n'existe plus. Une policy qui exigerait
-- son existence refuserait précisément le seul moment où l'on veut effacer, et
-- garantirait les orphelins qu'elle prétend éviter.
--
-- Le monde, lui, survit à ses pages : c'est le propriétaire durable de ces
-- fichiers, et c'est donc lui qui décide.
CREATE POLICY "wiki: editors delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'wiki'
    AND objects.name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND public.is_world_editor(
      (substring(objects.name, '^world-([0-9a-fA-F-]{36})/'))::uuid,
      (select auth.uid())
    )
  );

-- Aucune policy UPDATE : rien n'écrase un fichier ici. Chaque envoi porte un
-- nom neuf, et remplacer une image consiste à en poser une autre puis à
-- effacer l'ancienne. Ne pas accorder ce qui ne sert pas.

-- ── CE QUE CETTE MIGRATION NE FAIT PAS ───────────────────────
-- Les 8 bannières déjà envoyées restent dans `worlds`, à leur ancienne place.
-- Leur URL est enregistrée dans `world_wiki_pages.banner_url` et continue de
-- fonctionner ; les déplacer demanderait de les recopier par l'API de stockage
-- puis de réécrire la colonne, ce qu'un fichier SQL ne peut pas faire — un
-- renommage direct de `storage.objects.name` désynchroniserait la base et le
-- stockage objet. Elles échappent donc au ménage, et elles seules.

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'wiki';
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'wiki:%';
-- Sous l'identité d'un compte non éditeur, un INSERT et un DELETE sur
-- `world-<id>/page-<id>/x.webp` doivent être refusés ; sous celle d'un
-- éditeur du monde, acceptés — y compris après suppression de la page.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "wiki: public read"    ON storage.objects;
-- DROP POLICY IF EXISTS "wiki: editors write"  ON storage.objects;
-- DROP POLICY IF EXISTS "wiki: editors delete" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'wiki';  -- refusé si des objets restent
