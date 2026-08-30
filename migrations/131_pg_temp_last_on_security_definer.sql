-- ============================================================
-- Migration 131 — `pg_temp` en dernier sur les fonctions SECURITY DEFINER
-- ============================================================
-- Faille de masquage par table temporaire. 54 des 67 fonctions SECURITY
-- DEFINER du schéma `public` ne listaient pas `pg_temp` dans leur
-- `search_path`.
--
-- ── Pourquoi c'est une faille et pas un détail ───────────────
-- PostgreSQL cherche le schéma temporaire EN PREMIER quand `pg_temp` n'est pas
-- listé explicitement. Écrire `SET search_path = public` ne protège donc de
-- rien : une table temporaire homonyme passe devant la vraie. La parade
-- documentée est de nommer `pg_temp` en DERNIER, ce que fait ce fichier.
--
-- Et le vecteur est ouvert : `authenticated` COMME `anon` ont le droit TEMP
-- sur cette base — vérifié.
--
-- ── Démonstration, jouée puis annulée sur la production ──────
--   CREATE FUNCTION __sonde() RETURNS bigint
--     LANGUAGE sql SECURITY DEFINER SET search_path = public
--     AS $$ SELECT count(*) FROM user_blocks $$;
--   CREATE TEMP TABLE user_blocks (blocker_id uuid, blocked_id uuid);
--   INSERT INTO user_blocks VALUES (…), (…), (…);   -- 3 lignes
--
--   public.user_blocks               0 ligne   ← la vraie table
--   pg_temp.user_blocks              3 lignes  ← celle de l'attaquant
--   __sonde() search_path = public   3         ← elle a lu la mauvaise
--   __sonde() … , pg_temp            0         ← elle relit la bonne
--
-- ── Ce que ça permettait concrètement ────────────────────────
-- Neuf fonctions lisent des tables SANS les qualifier. Les plus parlantes :
--   find_or_create_dm   `SELECT 1 FROM user_blocks` — c'est le contrôle qui
--   search_dm_users     `SELECT 1 FROM user_blocks ub`   refuse d'ouvrir une
--                       conversation avec quelqu'un qui vous a bloqué. Masquée
--                       par une table temporaire vide, la vérification passe.
--   award_event         gamification_events, gamification_balances
--   get_dm_conversations / search_dm_messages
--                       dm_conversations, dm_messages, dm_reads, profiles
--   list_participated_chatrooms  chatrooms, chat_messages, chatroom_reads
--   block_user / unblock_user    user_blocks
--   count_common_worlds          world_members
--
-- Les 45 autres qualifient tout et n'étaient pas exposées. Elles sont durcies
-- quand même : la protection doit tenir à la prochaine ligne ajoutée, pas
-- dépendre de la vigilance de qui l'écrira.
--
-- ── Innocuité ────────────────────────────────────────────────
-- Ajouter `pg_temp` en fin de liste ne fait que RÉTROGRADER le schéma
-- temporaire, de premier cherché à dernier. Aucune fonction du schéma ne crée
-- de table temporaire — vérifié — donc aucune ne dépend de sa résolution.
--
-- Les 13 fonctions déjà en `public, extensions, pg_temp` ne sont pas touchées.

ALTER FUNCTION public.accept_marital_request(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.accept_world_invitation(uuid,boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.award_event(text,text,jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.block_user(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.can_create_world(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.confirm_world_age(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.count_common_worlds(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_marital_request_same_world() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_persona_limit() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_persona_usable_on_message_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_spouse_same_world() SET search_path = public, pg_temp;
ALTER FUNCTION public.find_or_create_dm(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_all_chatroom_unreads() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_app_shell(integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_balance_summary(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_chatroom_persona_stats(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_chatroom_stats(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_chatroom_unreads(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_dm_conversations(timestamp with time zone,integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_world_public_stats(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_locked_field_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_locked_field_update() SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_locked_section_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_user_deletion() SET search_path = public, pg_temp;
ALTER FUNCTION public.has_persona_capacity(uuid,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.has_persona_capacity(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_persona_usable(uuid,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_subscribed(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_world_admin(uuid,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_world_editor(uuid,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_world_member(uuid,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_world_owner_direct(uuid,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_world_owner(uuid,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.join_public_world(uuid,boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.list_chatrooms_nav(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.list_participated_chatrooms(uuid,integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_chatroom_reply() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_marital_request() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_on_persona_activity() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_push_on_notification_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.owned_worlds_count(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.owns_persona(uuid,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.recompute_summary_on_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.release_persona_field_locks(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.reset_persona_sections(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.search_dm_messages(text,integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.search_dm_users(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.search_users_for_world(uuid,text,integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_worlds_after_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.unblock_user(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.upsert_chatroom_summary_from_new() SET search_path = public, pg_temp;
ALTER FUNCTION public.wwp_is_restricted(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.wwp_log_version() SET search_path = public, pg_temp;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Aucune fonction SECURITY DEFINER ne doit rester sans `pg_temp` :
--   SELECT count(*) FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace AND prosecdef
--      AND coalesce(array_to_string(proconfig, ','), '') NOT LIKE '%pg_temp%';
--                                                              -- → 0
--
-- Et les corps ne changent pas :
--   SELECT md5(string_agg(prosrc, '|' ORDER BY oid)) FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace;   -- identique avant/après
