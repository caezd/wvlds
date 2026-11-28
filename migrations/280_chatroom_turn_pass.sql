-- ─────────────────────────────────────────────────────────────
-- Migration 280 — Ordre de passage : passer la main, « À vous de jouer »
--
-- 1. Le tour passe, au choix du salon (`advance_mode`) :
--      message — au premier message public du joueur (comportement de 211) ;
--      manual  — quand le joueur passe la main (`pass_chatroom_turn`), après
--                autant de messages et de blocs qu'il veut.
--    Le joueur dont c'est le tour peut passer la main dans les deux modes.
-- 2. `turn_started_at` : début du tour du joueur courant, tenu par la base
--    (« depuis 2 j » dans la liste des salons).
-- 3. Notification `turn_yours` au joueur dont le tour commence, sauf s'il
--    en est l'auteur ; celle du joueur précédent est marquée lue.
-- 4. Le canal du monde reçoit `turn` : la liste des salons sait où c'est à
--    vous sans relire. Salon privé : avis sans contenu, la liste se relit.
-- 5. `list_chatrooms_nav` rend `turn_user_id` et `turn_started_at`.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.chatroom_turns
  ADD COLUMN IF NOT EXISTS advance_mode text NOT NULL DEFAULT 'message',
  ADD COLUMN IF NOT EXISTS turn_started_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chatroom_turns_advance_mode_check') THEN
    ALTER TABLE public.chatroom_turns
      ADD CONSTRAINT chatroom_turns_advance_mode_check CHECK (advance_mode IN ('message', 'manual'));
  END IF;
END $$;

-- Joueur dont c'est le tour, ou NULL hors ordre actif.
CREATE OR REPLACE FUNCTION public.chatroom_turn_current_user(p_enabled boolean, p_order uuid[], p_index integer)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_enabled AND cardinality(p_order) > 0 THEN p_order[(p_index % cardinality(p_order)) + 1]
  END;
$$;

-- Monde et index comme en 211 ; le début du tour change avec le joueur.
CREATE OR REPLACE FUNCTION public.chatroom_turns_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT c.world_id INTO NEW.world_id FROM public.chatrooms c WHERE c.id = NEW.chat_id;
  IF NEW.world_id IS NULL THEN
    RAISE EXCEPTION 'salon hors monde' USING ERRCODE = '22023';
  END IF;
  IF cardinality(NEW.order_user_ids) = 0 THEN
    NEW.current_index := 0;
  ELSE
    NEW.current_index := NEW.current_index % cardinality(NEW.order_user_ids);
  END IF;
  IF TG_OP = 'INSERT'
     OR public.chatroom_turn_current_user(NEW.enabled, NEW.order_user_ids, NEW.current_index)
        IS DISTINCT FROM public.chatroom_turn_current_user(OLD.enabled, OLD.order_user_ids, OLD.current_index) THEN
    NEW.turn_started_at := now();
  ELSE
    NEW.turn_started_at := OLD.turn_started_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Un message public ne fait avancer que l'ordre en mode « message ».
CREATE OR REPLACE FUNCTION public.chatroom_turns_advance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.visible_to IS NOT NULL THEN
    RETURN NULL;
  END IF;
  UPDATE public.chatroom_turns t
     SET current_index = t.current_index + 1
   WHERE t.chat_id = NEW.chat_id
     AND t.enabled
     AND t.advance_mode = 'message'
     AND cardinality(t.order_user_ids) > 0
     AND t.order_user_ids[t.current_index + 1] = NEW.author_id;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- L'ordre de passage ne doit jamais empêcher de poster.
  RAISE WARNING 'chatroom_turns_advance : %', SQLERRM;
  RETURN NULL;
END;
$$;

-- Le joueur dont c'est le tour passe la main au suivant. SECURITY DEFINER :
-- il n'a pas le droit de modifier l'ordre lui-même (policies de 211).
CREATE OR REPLACE FUNCTION public.pass_chatroom_turn(p_chat_id uuid)
RETURNS public.chatroom_turns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.chatroom_turns;
BEGIN
  UPDATE public.chatroom_turns t
     SET current_index = t.current_index + 1
   WHERE t.chat_id = p_chat_id
     AND t.enabled
     AND cardinality(t.order_user_ids) > 0
     AND t.order_user_ids[t.current_index + 1] = (SELECT auth.uid())
  RETURNING * INTO r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ce n''est pas votre tour' USING ERRCODE = '42501';
  END IF;
  RETURN r;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pass_chatroom_turn(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pass_chatroom_turn(uuid) TO authenticated;

-- ── Notification « À vous de jouer » ─────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite', 'chatroom_reply',
  'persona_new_chatroom', 'persona_reply', 'relation_request', 'role_mention', 'everyone_mention',
  'persona_submitted', 'persona_reviewed', 'sequel_request', 'world_announcement', 'turn_yours'
]::text[]));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_type_check;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_type_check CHECK (type = ANY (ARRAY[
  'mention', 'reaction', 'new_member', 'new_chatroom', 'chatroom_reply', 'persona_new_chatroom',
  'persona_reply', 'relation_request', 'role_mention', 'everyone_mention', 'persona_submitted',
  'persona_reviewed', 'sequel_request', 'turn_yours'
]::text[]));

CREATE OR REPLACE FUNCTION public.notify_chatroom_turn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new uuid := public.chatroom_turn_current_user(NEW.enabled, NEW.order_user_ids, NEW.current_index);
  v_old uuid;
  v_actor uuid := (SELECT auth.uid());
  v_actor_name text;
  v_title text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old := public.chatroom_turn_current_user(OLD.enabled, OLD.order_user_ids, OLD.current_index);
  END IF;
  IF v_new IS NOT DISTINCT FROM v_old THEN
    RETURN NULL;
  END IF;

  -- Le tour a quitté ce joueur : son « À vous de jouer » est périmé.
  IF v_old IS NOT NULL THEN
    UPDATE public.notifications n
       SET read_at = now()
     WHERE n.recipient_id = v_old AND n.chat_id = NEW.chat_id
       AND n.type = 'turn_yours' AND n.read_at IS NULL;
  END IF;

  IF v_new IS NULL OR v_new IS NOT DISTINCT FROM v_actor
     OR NOT public.can_read_chatroom(NEW.chat_id, v_new)
     OR EXISTS (
       SELECT 1 FROM public.notification_preferences np
        WHERE np.user_id = v_new AND np.type = 'turn_yours' AND np.enabled = false
     ) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(c.title, c.name) INTO v_title FROM public.chatrooms c WHERE c.id = NEW.chat_id;
  SELECT p.username INTO v_actor_name FROM public.profiles p WHERE p.id = v_actor;

  -- Une seule notification non lue par salon : la plus récente.
  DELETE FROM public.notifications n
   WHERE n.recipient_id = v_new AND n.chat_id = NEW.chat_id
     AND n.type = 'turn_yours' AND n.read_at IS NULL;
  INSERT INTO public.notifications (recipient_id, type, world_id, chat_id, actor_id, actor_name, content)
  VALUES (v_new, 'turn_yours', NEW.world_id, NEW.chat_id, v_actor, v_actor_name, left(v_title, 200));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Notifier ne doit jamais empêcher le tour de passer.
  RAISE WARNING 'notify_chatroom_turn : %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_chatroom_turn() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_chatroom_turn ON public.chatroom_turns;
CREATE TRIGGER trg_notify_chatroom_turn
  AFTER INSERT OR UPDATE ON public.chatroom_turns
  FOR EACH ROW EXECUTE FUNCTION public.notify_chatroom_turn();

-- ── Canal du monde ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_world_turn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := public.chatroom_turn_current_user(NEW.enabled, NEW.order_user_ids, NEW.current_index);
  v_private boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND v_user IS NOT DISTINCT FROM public.chatroom_turn_current_user(OLD.enabled, OLD.order_user_ids, OLD.current_index)
     AND NEW.turn_started_at IS NOT DISTINCT FROM OLD.turn_started_at THEN
    RETURN NULL;
  END IF;
  SELECT c.visibility = 'private' INTO v_private FROM public.chatrooms c WHERE c.id = NEW.chat_id;
  IF v_private THEN
    PERFORM public.wvlds_notify('world:' || NEW.world_id::text, 'turn',
      jsonb_build_object('chat_id', NEW.chat_id, 'private', true));
  ELSE
    PERFORM public.wvlds_notify('world:' || NEW.world_id::text, 'turn',
      jsonb_build_object('chat_id', NEW.chat_id, 'turn_user_id', v_user, 'turn_started_at', NEW.turn_started_at));
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_world_turn : %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.broadcast_world_turn() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_broadcast_world_turn ON public.chatroom_turns;
CREATE TRIGGER trg_broadcast_world_turn
  AFTER INSERT OR UPDATE ON public.chatroom_turns
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_turn();

-- Le salon de la languette reçoit aussi le mode et le début du tour.
CREATE OR REPLACE FUNCTION public.broadcast_room_turn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('chat_id', NEW.chat_id, 'enabled', NEW.enabled,
                       'order_user_ids', NEW.order_user_ids, 'current_index', NEW.current_index,
                       'advance_mode', NEW.advance_mode, 'turn_started_at', NEW.turn_started_at),
    'turn', 'room:' || NEW.chat_id::text, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_turn : %', SQLERRM;
  RETURN NULL;
END;
$$;

-- ── Liste des salons : à qui le tour, depuis quand ───────────
DROP FUNCTION IF EXISTS public.list_chatrooms_nav(uuid);
CREATE FUNCTION public.list_chatrooms_nav(p_world_id uuid)
RETURNS TABLE(id uuid, title text, name text, icon_url text, last_message_at timestamp with time zone,
              last_message_excerpt text, unread_count integer, category_id uuid, last_poster_avatar_url text,
              last_poster_id uuid, participant_count integer, second_poster_avatar_url text, timeline_date jsonb,
              created_at timestamp with time zone, turn_user_id uuid, turn_started_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH moi AS (SELECT auth.uid() AS uid),
  salons AS (
    SELECT r.*
    FROM public.chatrooms r
    WHERE r.world_id = p_world_id
      AND (
        EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = p_world_id AND wm.user_id = (SELECT uid FROM moi))
        OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.owner_id = (SELECT uid FROM moi))
      )
      AND (r.visibility <> 'private' OR public.can_read_private_chatroom(r.id, (SELECT uid FROM moi)))
  ),
  stats AS (
    SELECT m.chat_id,
      COUNT(*) FILTER (
        WHERE m.author_id <> (SELECT uid FROM moi)
          AND (m.created_at > COALESCE(cr.last_read_at, '-infinity'::timestamptz)
               OR (m.inserted_at IS NOT NULL
                   AND m.inserted_at > COALESCE(cr.last_read_at, '-infinity'::timestamptz)))
      )::int AS unread_count,
      COUNT(DISTINCT m.author_id) FILTER (
        WHERE (SELECT uid FROM moi) IS NULL OR m.author_id <> (SELECT uid FROM moi)
      )::int AS participant_count
    FROM public.chat_messages m
    JOIN salons r ON r.id = m.chat_id
    LEFT JOIN public.chatroom_reads cr
      ON cr.chat_id = m.chat_id AND cr.user_id = (SELECT uid FROM moi)
    GROUP BY m.chat_id
  )
  SELECT
    r.id,
    r.title,
    r.name,
    r.icon_url,
    s.last_message_at,
    s.last_message_excerpt,
    COALESCE(st.unread_count, 0) AS unread_count,
    r.category_id,
    COALESCE(s.last_message_persona_avatar_url, p.avatar_url) AS last_poster_avatar_url,
    s.last_message_author_id                                   AS last_poster_id,
    COALESCE(st.participant_count, 0)                          AS participant_count,
    (SELECT COALESCE(pn.avatar_url, p2.avatar_url)
     FROM public.chat_messages cm2
     LEFT JOIN public.profiles p2 ON p2.id = cm2.author_id
     LEFT JOIN public.personas pn ON pn.id = cm2.persona_id
     WHERE cm2.chat_id = r.id
       AND ((SELECT uid FROM moi) IS NULL OR cm2.author_id <> (SELECT uid FROM moi))
       AND (s.last_message_author_id IS NULL OR cm2.author_id <> s.last_message_author_id)
     ORDER BY cm2.created_at DESC
     LIMIT 1
    ) AS second_poster_avatar_url,
    r.timeline_date,
    r.created_at,
    public.chatroom_turn_current_user(t.enabled, t.order_user_ids, t.current_index) AS turn_user_id,
    t.turn_started_at
  FROM salons r
  LEFT JOIN public.chatroom_summaries s ON s.chat_id = r.id
  LEFT JOIN public.profiles p ON p.id = s.last_message_author_id
  LEFT JOIN stats st ON st.chat_id = r.id
  LEFT JOIN public.chatroom_turns t ON t.chat_id = r.id
  ORDER BY COALESCE(s.last_message_at, r.created_at) DESC, r.created_at DESC, r.id;
$$;
