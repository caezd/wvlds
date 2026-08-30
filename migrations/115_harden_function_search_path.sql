-- ============================================================
-- Migration 115 — Durcissement du search_path des fonctions
-- ============================================================
-- Les 24 fonctions de `public` n'épinglaient pas leur search_path : il était
-- hérité du rôle appelant. Pour une fonction SECURITY DEFINER (la moitié de la
-- liste : shop_*, notify_on_*, claim_challenge_attempt…) c'est une voie
-- d'escalade — un appelant qui place un schéma à lui devant `public` peut faire
-- résoudre une table ou un opérateur vers ses propres objets, exécutés avec les
-- droits du propriétaire de la fonction.
--
-- On épingle `public, extensions, pg_temp` :
--   • `public`     — schéma des tables applicatives, déjà résolu ainsi aujourd'hui ;
--   • `extensions` — pgcrypto / uuid-ossp y sont installés (gen_random_uuid, etc.) ;
--   • `pg_temp`    — placé EN DERNIER, pour qu'une table temporaire de l'appelant
--                    ne puisse jamais masquer une table applicative.
--
-- ALTER FUNCTION ne touche pas au corps des fonctions : aucun changement de
-- comportement attendu, uniquement la résolution de noms qui devient déterministe.

ALTER FUNCTION public.claim_challenge_attempt(p_challenge_id uuid, p_message_id bigint, p_chat_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.enforce_notification_preference() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.enforce_world_tags_limit() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.ensure_default_world_tabs(p_world_id uuid, p_creator uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.expire_daily_challenges(p_date date) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_active_daily_challenges(p_world_id uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_daily_challenge_journal(p_date date) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.is_user_subscribed(uid uuid) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.msg_excerpt(txt text, max_len integer) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.notify_on_new_chatroom() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.notify_on_new_member() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.notify_on_reaction() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.search_chat_messages(p_world_id uuid, p_chat_ids uuid[], p_author_ids uuid[], p_persona_ids uuid[], p_author_mode text, p_has_media boolean, p_pinned boolean, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_cursor_created_at timestamp with time zone, p_cursor_id bigint, p_limit integer) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.shop_equip(p_item_key text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.shop_list_items() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.shop_purchase(p_item_key text, p_equip boolean) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.shop_unequip(p_slot text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.tg_set_chat_message_world_id() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.tg_touch_updated_at() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.tg_world_defaults_tabs() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.touch_chatroom_updated_at() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.touch_updated_at() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.wwp_rename_cascade(p_world_id uuid, p_old_title text, p_new_title text) SET search_path = public, extensions, pg_temp;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Doit renvoyer 0 ligne après application :
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prokind = 'f'
--     AND (p.proconfig IS NULL OR NOT EXISTS (
--           SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Rejouer la même liste en remplaçant `SET search_path = ...` par
-- `RESET search_path`, p. ex. :
--   ALTER FUNCTION public.shop_purchase(p_item_key text, p_equip boolean) RESET search_path;
