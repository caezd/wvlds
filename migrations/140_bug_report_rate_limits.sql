-- ============================================================
-- Migration 140 — Garde-fous des signalements de bug
-- ============================================================
-- La migration 138 a créé le bucket `bug-reports` sans borne, alors que les
-- sept autres buckets du projet en posent deux. Le dépôt se faisant du
-- navigateur DIRECTEMENT vers le stockage — c'est ce qui permet au bucket
-- d'être privé sans que le serveur relaie les octets —, la liste de types du
-- formulaire n'était qu'une suggestion : rien n'empêchait un compte
-- authentifié de déposer un fichier de n'importe quelle taille et de n'importe
-- quel type, en quantité illimitée, sans jamais envoyer de rapport.
--
-- Trois garde-fous ici, et de quoi retrouver les images jamais envoyées.

-- ── 1. Les bornes du bucket ─────────────────────────────────────────────────
-- Aligné sur `chatrooms` : 5 Mo suffisent largement à une capture d'écran, et
-- c'est ici — et nulle part ailleurs — que la liste de types devient opposable.
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
WHERE id = 'bug-reports';

-- ── 2. Les compteurs ────────────────────────────────────────────────────────
-- Une policy qui interrogerait sa propre table déclencherait ses propres
-- policies : PostgreSQL refuse (« infinite recursion detected in policy for
-- relation »). Le comptage passe donc par des fonctions SECURITY DEFINER, qui
-- lisent hors de la RLS.
--
-- Elles ne rendent qu'un entier, pour un compte donné : rien qu'il ne sache
-- déjà de lui-même. `pg_temp` en dernier dans le `search_path`, selon la
-- migration 131.

CREATE OR REPLACE FUNCTION public.bug_reports_recent_count(uid uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  -- Sert l'index bug_reports_user_created_idx (user_id, created_at DESC).
  SELECT count(*)::int
  FROM public.bug_reports
  WHERE user_id = uid AND created_at > now() - interval '1 hour';
$$;

CREATE OR REPLACE FUNCTION public.bug_report_uploads_recent_count(uid uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = storage, pg_temp
AS $$
  SELECT count(*)::int
  FROM storage.objects
  WHERE bucket_id = 'bug-reports'
    AND objects.name LIKE 'user-' || uid::text || '/%'
    AND objects.created_at > now() - interval '1 hour';
$$;

REVOKE ALL ON FUNCTION public.bug_reports_recent_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bug_report_uploads_recent_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bug_reports_recent_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bug_report_uploads_recent_count(uuid) TO authenticated;

-- ── 3. Les plafonds ─────────────────────────────────────────────────────────
-- Par heure et non au total : un total finirait par bloquer définitivement un
-- compte honnête, les fichiers orphelins n'étant jamais nettoyés d'eux-mêmes.
-- Une fenêtre glissante se répare seule.
--
-- Cinq rapports par heure : large pour qui signale de bonne foi, y compris en
-- découvrant plusieurs défauts d'affilée. Quinze dépôts : cinq rapports de
-- trois images, de quoi réessayer après un envoi raté.

DROP POLICY IF EXISTS "bug_reports: insert own" ON public.bug_reports;
CREATE POLICY "bug_reports: insert own"
  ON public.bug_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'new'
    AND admin_note IS NULL
    AND public.bug_reports_recent_count((SELECT auth.uid())) < 5
  );

DROP POLICY IF EXISTS "bug-reports: insert own prefix" ON storage.objects;
CREATE POLICY "bug-reports: insert own prefix" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bug-reports'
    AND objects.name LIKE 'user-' || (SELECT auth.uid())::text || '/%'
    AND public.bug_report_uploads_recent_count((SELECT auth.uid())) < 15
  );

-- ── 4. Les images jamais envoyées ───────────────────────────────────────────
-- Une image part vers le stockage AVANT le rapport : celui qui change d'avis,
-- ou dont l'envoi échoue, laisse un fichier que plus rien ne désigne. Le
-- nettoyage à la suppression d'un rapport ne les couvre pas — ils n'ont jamais
-- appartenu à aucun.
--
-- Ils sont identifiables sans ambiguïté : un objet du bucket dont le chemin
-- n'apparaît dans les `attachments` d'AUCUN rapport. Le délai de grâce est ce
-- qui rend l'identification sûre — sans lui, on supprimerait les images d'un
-- formulaire encore en train d'être rempli, déposées mais pas encore envoyées.
--
-- Rend les chemins plutôt que de supprimer : effacer la ligne de
-- `storage.objects` laisserait l'octet dans le stockage d'objets. Seule l'API
-- de stockage supprime vraiment un fichier — c'est donc à l'appelant de le
-- faire, avec cette liste.
CREATE OR REPLACE FUNCTION public.orphan_bug_report_attachments(grace interval DEFAULT interval '24 hours')
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, storage, pg_temp
AS $$
BEGIN
  -- SECURITY DEFINER lit hors de la RLS : sans ce contrôle, n'importe quel
  -- compte obtiendrait la liste des dépôts de tout le monde.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
  ) THEN
    RAISE EXCEPTION 'réservé aux administrateurs';
  END IF;

  RETURN QUERY
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'bug-reports'
    AND o.created_at < now() - grace
    AND NOT EXISTS (
      SELECT 1 FROM public.bug_reports r
      WHERE o.name = ANY (r.attachments)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.orphan_bug_report_attachments(interval) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_bug_report_attachments(interval) TO authenticated;
