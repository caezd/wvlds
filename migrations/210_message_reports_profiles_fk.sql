-- 210 — Les personnes d'un signalement pointent vers `profiles`, pas `auth.users`.
--
-- La migration 209 faisait référencer `auth.users` à reporter_id,
-- message_author_id et resolved_by. PostgREST n'expose pas le schéma `auth` :
-- la file de modération ne pouvait pas joindre le pseudo du signaleur ni de
-- l'auteur (`reporter:reporter_id(username)` → PGRST200). Même choix que
-- `chat_messages.author_id`, qui référence `profiles`. La table était vide.

ALTER TABLE public.message_reports
  DROP CONSTRAINT IF EXISTS message_reports_reporter_id_fkey,
  DROP CONSTRAINT IF EXISTS message_reports_message_author_id_fkey,
  DROP CONSTRAINT IF EXISTS message_reports_resolved_by_fkey;

ALTER TABLE public.message_reports
  ADD CONSTRAINT message_reports_reporter_id_fkey
    FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT message_reports_message_author_id_fkey
    FOREIGN KEY (message_author_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT message_reports_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
