-- ============================================================
-- Migration 045 — Cron quotidien pour les défis (pg_net + pg_cron)
-- Prérequis : activer pg_net et pg_cron dans le dashboard Supabase
--   Database > Extensions > pg_net  ✓
--   Database > Extensions > pg_cron ✓
-- ============================================================

-- Paramètres à renseigner dans Database > Settings > Configuration
-- (ou via ALTER DATABASE ... SET app.supabase_url / app.supabase_anon_key)
-- Ces valeurs sont récupérées par l'Edge Function via les variables d'env
-- SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY injectées automatiquement.

-- ── Planifier l'appel à l'Edge Function chaque jour à minuit UTC ──────────
SELECT cron.schedule(
  'generate-daily-challenge',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/generate-daily-challenge',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ── Configurer les paramètres d'app (à adapter avec vos valeurs) ──────────
-- ALTER DATABASE postgres SET app.supabase_url              = 'https://xxxx.supabase.co';
-- ALTER DATABASE postgres SET app.supabase_service_role_key = 'eyJ...';
-- Ces lignes sont commentées car les valeurs sont propres à chaque projet.
-- À exécuter manuellement dans le SQL Editor après avoir rempli les valeurs.
