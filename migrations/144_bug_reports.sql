-- ============================================================
-- Migration 144 — Rapports de bug
-- ============================================================
-- Un utilisateur signale un problème depuis son menu ; un administrateur les
-- trie depuis la zone admin. La table est donc lue par deux publics aux droits
-- très différents, ce que les policies ci-dessous séparent explicitement.
--
-- Le rapport est en AJOUT SEUL pour son auteur : il peut le créer et le relire,
-- jamais le modifier. Autoriser la modification laisserait réécrire un rapport
-- après qu'un administrateur l'a lu et commencé à traiter — le fil de la
-- discussion perdrait son sens. Le statut et la note de traitement sont, eux,
-- réservés aux administrateurs.
--
-- `page_url` et `user_agent` sont capturés automatiquement à l'envoi : ce sont
-- les deux informations qui rendent un rapport exploitable et qu'un utilisateur
-- ne pense jamais à donner. `app_version` situe le rapport dans le temps, une
-- version déployée depuis pouvant avoir déjà corrigé le problème.

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  -- Contexte capturé, jamais saisi.
  page_url     TEXT,
  user_agent   TEXT,
  app_version  TEXT,
  -- Traitement, réservé aux administrateurs.
  status       TEXT NOT NULL DEFAULT 'new',
  admin_note   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Bornes en base et non seulement côté serveur : la colonne est la dernière
  -- ligne de défense, et c'est la discipline retenue par la migration 126 pour
  -- toutes les colonnes de texte alimentées par un utilisateur.
  CONSTRAINT bug_reports_description_length
    CHECK (char_length(description) BETWEEN 1 AND 4000),
  CONSTRAINT bug_reports_page_url_length
    CHECK (page_url IS NULL OR char_length(page_url) <= 2000),
  CONSTRAINT bug_reports_user_agent_length
    CHECK (user_agent IS NULL OR char_length(user_agent) <= 500),
  CONSTRAINT bug_reports_app_version_length
    CHECK (app_version IS NULL OR char_length(app_version) <= 100),
  CONSTRAINT bug_reports_admin_note_length
    CHECK (admin_note IS NULL OR char_length(admin_note) <= 4000),
  CONSTRAINT bug_reports_status_valid
    CHECK (status IN ('new', 'in_progress', 'resolved', 'declined'))
);

-- La page de tri liste par statut, du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS bug_reports_status_created_idx
  ON public.bug_reports (status, created_at DESC);

-- « Mes signalements » — et le parcours des rapports d'un compte donné.
CREATE INDEX IF NOT EXISTS bug_reports_user_created_idx
  ON public.bug_reports (user_id, created_at DESC);

DROP TRIGGER IF EXISTS bug_reports_set_updated_at ON public.bug_reports;
CREATE TRIGGER bug_reports_set_updated_at
  BEFORE UPDATE ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Chacun relit ses propres signalements ; un administrateur les voit tous.
CREATE POLICY "bug_reports: select own or admin"
  ON public.bug_reports FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    )
  );

-- `WITH CHECK` sur `user_id` : sans lui, un rapport pourrait être déposé au nom
-- d'un autre compte, et apparaîtrait dans SES signalements.
--
-- `status` et `admin_note` sont contraints à leur valeur d'ouverture : la
-- policy d'UPDATE étant réservée aux administrateurs, un auteur qui pourrait
-- les choisir à l'insertion contournerait cette réserve dès la création — en
-- déposant par exemple un rapport déjà marqué « resolved ».
CREATE POLICY "bug_reports: insert own"
  ON public.bug_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'new'
    AND admin_note IS NULL
  );

-- Le traitement n'appartient qu'aux administrateurs. Aucune policy d'UPDATE
-- pour l'auteur : son rapport est en ajout seul (voir l'en-tête).
CREATE POLICY "bug_reports: update admin"
  ON public.bug_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    )
  );

CREATE POLICY "bug_reports: delete admin"
  ON public.bug_reports FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    )
  );

REVOKE ALL ON public.bug_reports FROM anon;
