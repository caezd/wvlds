-- ============================================================
-- Migration 170 — Quatre index de clé étrangère, et pas quarante
-- ============================================================
-- Une clé étrangère sans index ne ralentit pas la lecture ordinaire : elle se
-- paie du côté du PARENT. Supprimer une ligne référencée oblige Postgres à
-- retrouver celles qui la désignent, et sans index il parcourt la table
-- enfant en entier — à chaque suppression, pour chaque `CASCADE` ou
-- `SET NULL`.
--
-- Les advisors en signalent quarante-trois. Les poser tous serait une
-- erreur : `notifications` reçoit une ligne par événement, et chaque index
-- s'y paie à CHAQUE insertion, c'est-à-dire tout le temps — pour épargner un
-- parcours qui, lui, n'arrive qu'à une suppression. On n'indexe donc que là
-- où le parent est réellement supprimé en usage et où l'enfant grossit.
--
-- Ce qui donne quatre index, et le raisonnement pour chacun :
--
--   notifications.message_id  — un message effacé, c'est courant, et c'est
--     la table qui grandit le plus vite de toutes.
--   notifications.persona_id  — supprimer un persona est un geste ordinaire
--     (quota, ménage), et il touche aussi les trois tables ci-dessous.
--   notifications.chat_id     — fermer un salon est une action d'administration
--     normale.
--   world_map_regions.wiki_page_id — supprimer une page de wiki l'est aussi.
--
-- Laissés de côté, sciemment : `notifications.world_id` et
-- `notifications.actor_id` (supprimer un monde ou un compte est rare, et
-- lent une fois n'est pas grave), `chat_messages.author_id` (la plus grosse
-- table, mais un profil ne se supprime qu'à la fermeture d'un compte), et
-- les trente-six autres, dont les tables tiennent en une page.

CREATE INDEX IF NOT EXISTS notifications_message_idx
  ON public.notifications (message_id) WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_persona_idx
  ON public.notifications (persona_id) WHERE persona_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_chat_idx
  ON public.notifications (chat_id) WHERE chat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS world_map_regions_wiki_page_idx
  ON public.world_map_regions (wiki_page_id) WHERE wiki_page_id IS NOT NULL;

-- Partiels : la colonne est nulle la plupart du temps — une notification ne
-- désigne qu'un objet à la fois. L'index ne porte alors que les lignes qui
-- comptent, et les insertions qui laissent la colonne nulle ne le touchent
-- même pas.

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   EXPLAIN ANALYZE DELETE FROM chat_messages WHERE id = '...';
--   -- le plan doit montrer un parcours d'index sur notifications

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.notifications_message_idx;
-- DROP INDEX IF EXISTS public.notifications_persona_idx;
-- DROP INDEX IF EXISTS public.notifications_chat_idx;
-- DROP INDEX IF EXISTS public.world_map_regions_wiki_page_idx;
