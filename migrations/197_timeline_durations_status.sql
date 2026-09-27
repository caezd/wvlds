-- ─────────────────────────────────────────────────────────────
-- Migration 197 — Événements qui durent, statut des salons
--
-- 1. Un événement du monde peut durer : une guerre, un siège, un hiver.
--    `end_date` (même forme que `timeline_date`) borne sa fin ; la frise
--    trace une barre le long du fil, du début à la fin. Une fin ne précède
--    jamais le début (même comparaison que les suites, migration 195).
--
-- 2. Un salon a un statut : en cours (par défaut), terminé ou abandonné. Le
--    créateur du salon et qui gère les salons du monde le changent — c'est
--    déjà la règle de modification d'un salon (`chatrooms_update`). « En
--    sommeil » n'est pas un statut enregistré : la frise le déduit de la date
--    du dernier message (`chatroom_summaries`) et du réglage du monde.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.world_timeline_events
  ADD COLUMN IF NOT EXISTS end_date jsonb;

ALTER TABLE public.world_timeline_events
  ADD CONSTRAINT world_timeline_events_end_date_shape CHECK (
    end_date IS NULL
    OR (jsonb_typeof(end_date) = 'object' AND jsonb_typeof(end_date -> 'year') = 'number')
  );

ALTER TABLE public.world_timeline_events
  ADD CONSTRAINT world_timeline_events_end_after_start CHECK (
    NOT public.timeline_date_after(timeline_date, end_date)
  );

ALTER TABLE public.chatrooms
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.chatrooms
  ADD CONSTRAINT chatrooms_status_enum CHECK (status IN ('active', 'completed', 'abandoned'));
