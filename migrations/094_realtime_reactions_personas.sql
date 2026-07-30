-- ============================================================
-- Migration 094 — Realtime manquant sur chat_message_reactions et personas
-- ============================================================
-- Découvert en testant en direct la fusion des canaux Realtime de
-- useRealtimeChatSync (hooks/useRealtimeChatSync.ts) : ces deux tables
-- n'étaient jamais entrées dans la publication supabase_realtime. Un binding
-- postgres_changes sur une table non publiée fait échouer tout le canal
-- Realtime qui le porte, pas seulement ce binding — jusqu'ici contenu à un
-- canal dédié par binding (réactions/avatar persona en direct probablement
-- déjà silencieusement cassés), mais fatal dès qu'on mutualise plusieurs
-- bindings sur un même canal.

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.personas;
