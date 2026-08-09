-- ============================================================
-- Migration 106 — Abonnements Web Push + relais des notifications
-- ============================================================
-- Chaque ligne représente UN abonnement PushManager (un navigateur/appareil).
-- `endpoint` est la clé naturelle du navigateur : upsert dessus (pas sur
-- user_id) pour supporter plusieurs appareils par utilisateur, et pour que
-- réabonner un même navigateur (permission ré-accordée, changement de
-- compte sur un poste partagé) réécrive proprement la ligne existante.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth_key      TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions: select own"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "push_subscriptions: insert own"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "push_subscriptions: update own"
  ON public.push_subscriptions FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "push_subscriptions: delete own"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.push_subscriptions FROM anon;

-- ── Relais push : chaque notification créée est renvoyée vers l'Edge ──────
-- Function send-push-notification, à condition que le destinataire ait au
-- moins un abonnement actif. AFTER INSERT sur `notifications` : par
-- construction, enforce_notification_preference() (BEFORE INSERT, migration
-- 035) a déjà annulé l'insert si le destinataire a désactivé ce type — ce
-- trigger ne voit donc jamais une notification que l'utilisateur ne veut pas.
--
-- NB : migrations/045_daily_challenge_cron.sql documentait un appel via
-- current_setting('app.supabase_url'/'app.supabase_service_role_key'), mais
-- ces settings DB n'ont en réalité jamais été configurés (confirmé : ALTER
-- DATABASE échoue avec "unrecognized configuration parameter"). Le cron du
-- défi quotidien qui fonctionne réellement en prod (cron.job) a l'URL et
-- l'Authorization codées en dur — on suit ce même pattern ici. Sans
-- conséquence sécurité : la fonction Edge est déployée avec verify_jwt=false
-- (comme generate-daily-challenge) et ne vérifie pas non plus ce header elle-
-- même ; il n'a besoin d'être qu'un Bearer syntaxiquement valide.

CREATE OR REPLACE FUNCTION public.notify_push_on_notification_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.push_subscriptions WHERE user_id = NEW.recipient_id
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://aecdzqmdkmnpdbtfaxnx.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlY2R6cW1ka21ucGRidGZheG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MTU5OTQsImV4cCI6MjA5NjI5MTk5NH0.xs6alw0HbjvsfcR3fxLIAEY4vD8ki48Z_SymC1_LtSA'
    ),
    body    := jsonb_build_object(
      'id',           NEW.id,
      'recipient_id', NEW.recipient_id,
      'type',         NEW.type,
      'world_id',     NEW.world_id,
      'chat_id',      NEW.chat_id,
      'actor_id',     NEW.actor_id,
      'actor_name',   NEW.actor_name,
      'content',      NEW.content,
      'metadata',     COALESCE(NEW.metadata, '{}'::jsonb)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_notification_insert_push ON public.notifications;
CREATE TRIGGER after_notification_insert_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_notification_insert();

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS after_notification_insert_push ON public.notifications;
-- DROP FUNCTION IF EXISTS public.notify_push_on_notification_insert();
-- DROP TABLE IF EXISTS public.push_subscriptions;
