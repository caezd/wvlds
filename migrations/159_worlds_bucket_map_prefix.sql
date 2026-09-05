-- ============================================================
-- Migration 159 — Le bucket `worlds` accepte les dossiers `world-…`
-- ============================================================
-- CORRECTION D'UNE RÉGRESSION EN PRODUCTION.
--
-- La migration 151 (cartes multiples) s'est accompagnée d'un nouveau rangement
-- des fichiers de la carte, dans `lib/storagePaths.ts` :
--
--   world-<id>/map-<id>/<uuid>.webp   — l'image d'une carte
--   world-<id>/pin-<id>/<uuid>.webp   — la bannière d'un lieu
--
-- Or les policies du bucket `worlds` n'autorisent l'écriture que sous
-- `user-<auth.uid()>/%`. Le nouveau chemin ne commence pas par `user-` : depuis
-- le déploiement, importer une image de carte ou une bannière de lieu échoue,
-- et l'interface affiche « Téléversement impossible ». La suppression des
-- fichiers remplacés échoue de même, en silence (`removeStoredFiles` est muet
-- par conception) : rien n'est perdu, mais rien n'est effacé non plus.
--
-- La migration 148 avait pourtant écrit noir sur blanc que « les policies du
-- bucket `worlds` sont strictement `user-<uid>/%` » — et avait contourné la
-- difficulté en créant un bucket séparé pour le wiki. Le rangement par monde
-- reste le bon choix (le dossier est l'unité de ménage) ; ce qui manquait,
-- c'étaient les policies qui vont avec.
--
-- Les anciennes policies `user-…` sont CONSERVÉES : l'icône et la bannière
-- d'un monde, ainsi que la bannière d'accueil, s'y rangent toujours.

-- ── Le piège de la colonne `name` (rappel des migrations 127 et 148) ──
-- `storage.objects` et plusieurs tables métier portent toutes deux une colonne
-- `name`. Sans qualification, un `substring(name, …)` écrit dans une policy se
-- résout vers la mauvaise table et la condition n'est jamais vraie — la policy
-- bloque alors tout le monde. D'où `objects.name` partout.

DROP POLICY IF EXISTS "worlds: map editors write"  ON storage.objects;
DROP POLICY IF EXISTS "worlds: map editors delete" ON storage.objects;

-- ── Écriture : éditeur du monde nommé par le dossier ─────────
-- Le motif exige la forme complète — `world-<uuid>/map-<uuid>/` ou
-- `world-<uuid>/pin-<uuid>/` — pour deux raisons : il garde le rangement
-- honnête, et il garantit que le `substring` ci-dessous rend bien un UUID
-- valide, sans quoi le cast lèverait une erreur au lieu de refuser.
--
-- Aucune jointure vers `world_maps` ou `world_map_pins`, contrairement à ce
-- que fait la migration 148 pour les pages du wiki : deux sortes de dossiers
-- cohabitent ici, et la vérification n'ajouterait aucun droit qu'un éditeur
-- n'ait déjà — il crée les cartes et les lieux de son monde à volonté.
CREATE POLICY "worlds: map editors write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'worlds'
    AND objects.name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(map|pin)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND public.is_world_editor(
      (substring(objects.name, '^world-([0-9a-fA-F-]{36})/'))::uuid,
      (select auth.uid())
    )
  );

-- ── Suppression : le MONDE, et lui seul ──────────────────────
-- Pas de condition sur la carte ni sur le lieu : le ménage a lieu quand l'un
-- ou l'autre vient d'être supprimé, donc quand la ligne n'existe plus. Une
-- policy qui exigerait son existence refuserait précisément le seul moment où
-- l'on veut effacer, et garantirait les orphelins qu'elle prétend éviter.
CREATE POLICY "worlds: map editors delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'worlds'
    AND objects.name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND public.is_world_editor(
      (substring(objects.name, '^world-([0-9a-fA-F-]{36})/'))::uuid,
      (select auth.uid())
    )
  );

-- Aucune policy UPDATE, comme pour le wiki : chaque envoi porte un nom tiré au
-- sort, rien n'écrase rien. Le `upsert: true` que le client passait à
-- `.upload()` est retiré dans le même commit — il ne servait pas, et il aurait
-- demandé un droit d'écrasement dont personne n'a besoin.

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname='storage' AND tablename='objects'
--      AND policyname LIKE 'worlds: map%';
--   -- attendu : write (INSERT), delete (DELETE)

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "worlds: map editors write"  ON storage.objects;
-- DROP POLICY IF EXISTS "worlds: map editors delete" ON storage.objects;
