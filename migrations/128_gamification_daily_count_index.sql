-- ============================================================
-- Migration 128 — Index du décompte quotidien de récompenses
-- ============================================================
-- `award_event('message_posted', …)` compte, à chaque message publié, les
-- récompenses déjà accordées au joueur dans la journée :
--
--   select count(*) from gamification_events
--    where user_id = … and event_type = 'message_posted' and created_day = …
--
-- Aucun des trois index existants ne la sert :
--   gamif_daily_unique       (user_id, event_type, created_day) WHERE daily_login
--   gamif_msg_unique         (event_type, ref_id)               WHERE message_posted
--   gamif_streak_msg_unique  (user_id, event_type, created_day) WHERE streak_by_message
--
-- Les deux premiers ne couvrent pas ce cas, le troisième porte sur un autre
-- type d'événement. Relevé par EXPLAIN : parcours séquentiel, 870 lignes
-- écartées par le filtre.
--
-- L'impact est nul aujourd'hui (0,4 ms sur 870 lignes) — mais cette table ne
-- fait que croître, d'une ligne par message publié, et la requête s'exécute à
-- chaque publication. C'est le seul endroit du schéma où un parcours complet
-- est adossé à une table dont la taille suit l'activité des joueurs.
--
-- L'index est partiel : il ne couvre que le type d'événement concerné, à
-- l'image des trois autres. `created_day` en dernier, la requête filtrant sur
-- égalité pour les trois colonnes.

CREATE INDEX IF NOT EXISTS gamif_msg_daily_count
  ON public.gamification_events (user_id, created_day)
  WHERE event_type = 'message_posted';

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- EXPLAIN (ANALYZE) SELECT count(*) FROM gamification_events
--  WHERE user_id = '<uid>' AND event_type = 'message_posted'
--    AND created_day = CURRENT_DATE;
-- → doit passer de « Seq Scan » à « Index Only Scan using gamif_msg_daily_count ».

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.gamif_msg_daily_count;
