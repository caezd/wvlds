-- ============================================================
-- Migration 127 — Règles d'accès aux fichiers
-- ============================================================
-- L'audit précédent portait sur les tables ; les buckets de stockage n'avaient
-- jamais été regardés. Les policies de `storage.objects` sont PERMISSIVE et se
-- cumulent en OU : il suffit d'une règle large pour annuler toutes les autres.
-- C'est ce qui s'est produit trois fois.
--
-- ── Trou n°1 : des policies de diagnostic laissées en production ──
-- Trois policies nommées « DIAG » sur le bucket `chatrooms` :
--
--   chatrooms delete DIAG   USING (bucket_id = 'chatrooms')
--   chatrooms upload DIAG   WITH CHECK (bucket_id = 'chatrooms')
--   chatrooms update DIAG   USING/CHECK (bucket_id = 'chatrooms')
--
-- Aucun contrôle d'identité : n'importe quel compte connecté pouvait supprimer
-- ou écraser n'importe quelle icône et n'importe quelle bannière de salon.
-- Mesuré : 7 fichiers sur 7.
--
-- ── Trou n°2 : les fichiers de persona ──
--
--   personas avatars authenticated update   USING (bucket_id = 'personas')
--   personas avatars authenticated upload   WITH CHECK (bucket_id = 'personas')
--
-- Même absence de contrôle. Mesuré sous l'identité d'un compte quelconque :
-- **77 fichiers appartenant à d'autres joueurs** étaient modifiables. Écraser
-- l'avatar d'un personnage d'autrui par une image arbitraire ne demandait
-- qu'un appel d'API.
--
-- ── Trou n°3 : les bannières de message ──
--
--   chat-banners authenticated insert / delete   AND auth.role() = 'authenticated'
--
-- Aucun contrôle de chemin : tout compte connecté pouvait supprimer les
-- bannières de n'importe quel salon, y compris dans des mondes dont il n'est
-- pas membre. Mesuré : 4 fichiers sur 4.
--
-- ── Pourquoi les policies strictes qui coexistaient ne servaient à rien ──
-- Le bucket `chatrooms` portait aussi des règles « own prefix » exigeant
-- `name LIKE 'user-<uid>/%'`. Or les fichiers y sont rangés sous
-- `chatroom-<id>/…` : ces règles ne correspondaient à AUCUN fichier. Elles ne
-- protégeaient donc rien, et seules les « DIAG » faisaient effectivement
-- fonctionner les envois — les retirer sans les remplacer aurait cassé
-- l'icône et la bannière de salon. Elles sont remplacées, pas supprimées.
--
-- Conventions de chemin relevées sur les fichiers existants :
--   chatrooms            chatroom-<id salon>/<icon|banner>.webp   (upsert)
--   chat-banners         <id salon>/<uuid>.webp
--   chat-media           <id salon>/<horodatage>-<alea>.<ext>
--   personas             user-<id compte>/…                        (80/80)
--   worlds               user-<id compte>/world-<id monde>/…        (47/47)
--   chatroom-categories  world-<id monde>/…                        (déjà correct)

-- ── Un piège à connaître : la colonne `name` est ambiguë ─────
-- Les conditions ci-dessous interrogent `public.chatrooms`, qui porte ELLE
-- AUSSI une colonne `name`. Écrit sans qualification, `substring(name, …)`
-- à l'intérieur du `EXISTS` se résout vers le nom du SALON, pas vers le
-- chemin du fichier : la condition ne peut alors jamais être vraie et la
-- policy bloque tout le monde, y compris les éditeurs légitimes. C'est ce
-- qui s'est produit au premier jet — la vérification l'a montré en voyant
-- un propriétaire de monde incapable de remplacer l'icône de son salon.
-- D'où `objects.name` partout.

-- ── Bucket `chatrooms` : réservé aux éditeurs du monde du salon ──
DROP POLICY IF EXISTS "chatrooms delete DIAG"        ON storage.objects;
DROP POLICY IF EXISTS "chatrooms upload DIAG"        ON storage.objects;
DROP POLICY IF EXISTS "chatrooms update DIAG"        ON storage.objects;
DROP POLICY IF EXISTS "chatrooms delete own files"   ON storage.objects;
DROP POLICY IF EXISTS "chatrooms delete own prefix"  ON storage.objects;
DROP POLICY IF EXISTS "chatrooms insert own prefix"  ON storage.objects;
DROP POLICY IF EXISTS "chatrooms update own prefix"  ON storage.objects;
DROP POLICY IF EXISTS "chatrooms modify own files"   ON storage.objects;

CREATE POLICY "chatrooms: editors write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chatrooms'
    AND objects.name ~ '^chatroom-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND EXISTS (
      SELECT 1 FROM public.chatrooms c
      WHERE c.id = (substring(objects.name, '^chatroom-([0-9a-fA-F-]{36})/'))::uuid
        AND public.is_world_editor(c.world_id, (select auth.uid()))
    )
  );

-- L'envoi se fait en `upsert` (l'icône garde toujours le même nom) : il faut
-- donc aussi le droit de mise à jour, sans quoi remplacer une icône échoue.
CREATE POLICY "chatrooms: editors update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chatrooms'
    AND EXISTS (
      SELECT 1 FROM public.chatrooms c
      WHERE c.id = (substring(objects.name, '^chatroom-([0-9a-fA-F-]{36})/'))::uuid
        AND public.is_world_editor(c.world_id, (select auth.uid()))
    )
  );

CREATE POLICY "chatrooms: editors delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chatrooms'
    AND EXISTS (
      SELECT 1 FROM public.chatrooms c
      WHERE c.id = (substring(objects.name, '^chatroom-([0-9a-fA-F-]{36})/'))::uuid
        AND public.is_world_editor(c.world_id, (select auth.uid()))
    )
  );

-- ── Bucket `personas` : chacun chez soi ──
-- Les règles « user-<uid>/ » existent déjà et couvrent 100 % des fichiers
-- (`personas upload by owner prefix`, `personas modify own files`,
-- `personas delete own files`). On retire seulement celles qui les annulaient.
DROP POLICY IF EXISTS "personas avatars authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "personas avatars authenticated update" ON storage.objects;

-- ── Bucket `chat-banners` : membres du monde du salon ──
-- Poster une bannière est une action de joueur, pas d'éditeur : on exige
-- l'appartenance au monde, pas les droits d'édition.
DROP POLICY IF EXISTS "chat-banners authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "chat-banners authenticated delete" ON storage.objects;

CREATE POLICY "chat-banners: members write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-banners'
    AND objects.name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND EXISTS (
      SELECT 1 FROM public.chatrooms c
      WHERE c.id = (substring(objects.name, '^([0-9a-fA-F-]{36})/'))::uuid
        AND public.is_world_member(c.world_id, (select auth.uid()))
    )
  );

-- Suppression : son propre fichier, ou celui d'un salon que l'on administre.
-- L'interface ne propose déjà le retrait qu'à l'auteur du bloc.
CREATE POLICY "chat-banners: owner or editor delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-banners'
    AND (
      objects.owner = (select auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.chatrooms c
        WHERE c.id = (substring(objects.name, '^([0-9a-fA-F-]{36})/'))::uuid
          AND public.is_world_editor(c.world_id, (select auth.uid()))
      )
    )
  );

-- ── Bucket `chat-media` : membres du monde du salon ──
-- La suppression était déjà limitée au propriétaire ; seul l'envoi acceptait
-- n'importe quel chemin, y compris dans le dossier d'un salon inaccessible.
DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;

CREATE POLICY "chat-media: members upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND objects.name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND EXISTS (
      SELECT 1 FROM public.chatrooms c
      WHERE c.id = (substring(objects.name, '^([0-9a-fA-F-]{36})/'))::uuid
        AND public.is_world_member(c.world_id, (select auth.uid()))
    )
  );

-- ── Limites de taille et de type ─────────────────────────────
-- Trois buckets n'en avaient aucune : n'importe quel fichier, de n'importe
-- quelle taille. Les quatre autres étaient déjà bornés. Relevé sur l'existant :
-- uniquement des images, la plus lourde faisant 1,1 Mo — les valeurs ci-dessous
-- laissent donc une marge confortable.
UPDATE storage.buckets
   SET file_size_limit = 10485760,
       allowed_mime_types = ARRAY['image/webp','image/jpeg','image/png','image/gif']
 WHERE id IN ('personas','worlds');

UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/webp','image/jpeg','image/png']
 WHERE id = 'chatrooms';

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Sous l'identité d'un compte membre d'aucun monde, ces comptes doivent
-- tomber à zéro (ils valaient 7, 77 et 4) :
--   SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', …);
--   UPDATE storage.objects SET updated_at = updated_at WHERE bucket_id='chatrooms';
--   UPDATE storage.objects SET updated_at = updated_at WHERE bucket_id='personas'
--     AND owner IS DISTINCT FROM <uid>;
-- Et un éditeur doit toujours pouvoir remplacer l'icône de son salon.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ⚠️ Rétablit les accès décrits ci-dessus — dépannage seulement.
-- CREATE POLICY "chatrooms upload DIAG" ON storage.objects
--   FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chatrooms');
-- CREATE POLICY "personas avatars authenticated update" ON storage.objects
--   FOR UPDATE TO authenticated USING (bucket_id = 'personas');
-- (etc. — les définitions d'origine figurent en tête de ce fichier)
