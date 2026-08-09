-- PERF : nettoyage confirmé par les advisors Supabase sur les tables DM.
--
-- 1. dm_messages.author_id et dm_reads.user_id sont des FK sans index
--    couvrant. dm_reads.user_id est justement la colonne utilisée par les
--    policies RLS de dm_reads (user_id = auth.uid()) : chaque lecture en
--    faisait un scan complet.
--
-- 2. dm_reads avait deux policies permissives pour SELECT : "dm_reads_select"
--    et "dm_reads_upsert" (FOR ALL, qui couvre déjà SELECT). Postgres évalue
--    les deux à chaque lecture au lieu d'une seule. Même nettoyage que
--    038/039 pour les autres tables, jamais fait ici car dm_reads a été créée
--    après (migration 041).

CREATE INDEX dm_messages_author_id_idx ON dm_messages (author_id);
CREATE INDEX dm_reads_user_id_idx ON dm_reads (user_id);

DROP POLICY "dm_reads_select" ON dm_reads;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- CREATE POLICY "dm_reads_select" ON dm_reads FOR SELECT USING (user_id = (SELECT auth.uid()));
-- DROP INDEX IF EXISTS public.dm_reads_user_id_idx;
-- DROP INDEX IF EXISTS public.dm_messages_author_id_idx;
