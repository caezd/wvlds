-- ============================================================
-- Migration 145 — Pièces jointes des rapports de bug
-- ============================================================
-- Une capture d'écran vaut souvent mieux qu'un paragraphe. Elle montre aussi
-- souvent autre chose que le bug : des messages, le profil d'un tiers, une
-- adresse e-mail. Le bucket est donc PRIVÉ — contrairement à `personas` ou
-- `worlds`, dont le contenu est fait pour être vu — et les images ne sont
-- accessibles que par une URL signée, générée côté serveur pour l'auteur du
-- rapport et pour les administrateurs.
--
-- La colonne stocke des CHEMINS de stockage, pas des URL : une URL signée
-- expire, l'enregistrer n'aurait aucun sens. La signature se fait à l'affichage.

ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS attachments TEXT[] NOT NULL DEFAULT '{}';

-- Trois pièces au plus, et des chemins de longueur raisonnable : la colonne
-- est alimentée par le client, comme le reste de la table (migration 144).
--
-- Passe par une fonction parce qu'une contrainte CHECK n'accepte pas de
-- sous-requête, et que borner CHAQUE élément d'un tableau en demande une
-- (« unnest »). Le corps de la fonction, lui, a le droit d'en contenir.
CREATE OR REPLACE FUNCTION public.bug_report_attachments_ok(chemins TEXT[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(array_length(chemins, 1), 0) <= 3
     AND NOT EXISTS (
       SELECT 1 FROM unnest(coalesce(chemins, ARRAY[]::text[])) AS chemin
       WHERE char_length(chemin) > 300 OR char_length(chemin) = 0
     );
$$;

ALTER TABLE public.bug_reports
  DROP CONSTRAINT IF EXISTS bug_reports_attachments_bounds;
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_attachments_bounds
  CHECK (public.bug_report_attachments_ok(attachments));

-- ── Bucket privé ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-reports', 'bug-reports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Chacun dépose sous son propre préfixe, comme dans le bucket `personas`
-- (`user-<uid>/`). Le préfixe est ce qui rend la propriété d'un fichier
-- lisible depuis son seul nom, sans jointure.
DROP POLICY IF EXISTS "bug-reports: insert own prefix" ON storage.objects;
CREATE POLICY "bug-reports: insert own prefix" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bug-reports'
    AND objects.name LIKE 'user-' || (SELECT auth.uid())::text || '/%'
  );

-- Lecture : son propre dépôt, ou tout pour un administrateur — qui doit voir
-- les captures des rapports qu'il trie.
DROP POLICY IF EXISTS "bug-reports: select own or admin" ON storage.objects;
CREATE POLICY "bug-reports: select own or admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bug-reports'
    AND (
      objects.name LIKE 'user-' || (SELECT auth.uid())::text || '/%'
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
      )
    )
  );

-- Suppression : même règle. Un auteur peut retirer une image envoyée par
-- erreur avant d'avoir validé son rapport, un administrateur peut nettoyer
-- après traitement.
DROP POLICY IF EXISTS "bug-reports: delete own or admin" ON storage.objects;
CREATE POLICY "bug-reports: delete own or admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'bug-reports'
    AND (
      objects.name LIKE 'user-' || (SELECT auth.uid())::text || '/%'
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
      )
    )
  );

-- Aucune policy pour `anon` : un visiteur non connecté n'a rien à faire ici,
-- et le bucket étant privé, l'absence de policy suffit à tout refuser.
