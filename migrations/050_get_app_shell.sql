-- ============================================================
-- Migration 050 — RPC agrégée get_app_shell()
-- ============================================================
-- Fusionne en un seul aller-retour réseau les données chargées au
-- bootstrap de NotificationsProvider et DmsProvider :
--   - world_ids (mondes dont l'utilisateur est membre, pour les abonnements
--     Realtime côté client)
--   - world_unreads (logique identique à get_world_unreads)
--   - room_unreads (logique identique à get_all_chatroom_unreads)
--   - notification_preferences
--   - notifications (page initiale, non archivées, avec le monde joint)
--   - dm_conversations (logique identique à get_dm_conversations)
--
-- SECURITY DEFINER bypass les RLS : chaque CTE filtre donc explicitement
-- sur auth.uid() (cf. 043_fix_get_dm_conversations_rls pour l'incident que
-- ce filtre évite).

CREATE OR REPLACE FUNCTION public.get_app_shell(p_notif_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH u AS (SELECT auth.uid() AS id),

  world_ids AS (
    SELECT wm.world_id
    FROM public.world_members wm
    WHERE wm.user_id = (SELECT id FROM u)
  ),

  msg_unreads AS (
    SELECT r.world_id, COUNT(*)::int AS c
    FROM public.chat_messages m
    JOIN public.chatrooms r ON r.id = m.chat_id
    LEFT JOIN public.chatroom_reads cr
      ON cr.chat_id = m.chat_id AND cr.user_id = (SELECT id FROM u)
    WHERE m.author_id <> (SELECT id FROM u)
      AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
    GROUP BY r.world_id
  ),
  room_unreads_by_world AS (
    SELECT c.world_id, COUNT(*)::int AS c
    FROM public.chatrooms c
    LEFT JOIN public.world_member_reads wmr
      ON wmr.world_id = c.world_id AND wmr.user_id = (SELECT id FROM u)
    WHERE (wmr.last_seen_at IS NULL OR c.created_at > wmr.last_seen_at)
      AND c.created_by <> (SELECT id FROM u)
    GROUP BY c.world_id
  ),
  world_unreads AS (
    SELECT
      w.id AS world_id,
      COALESCE(mu.c, 0) AS unread_messages,
      COALESCE(ru.c, 0) AS unread_rooms
    FROM public.worlds w
    JOIN public.world_members wm ON wm.world_id = w.id AND wm.user_id = (SELECT id FROM u)
    LEFT JOIN msg_unreads mu ON mu.world_id = w.id
    LEFT JOIN room_unreads_by_world ru ON ru.world_id = w.id
  ),

  room_unreads AS (
    SELECT
      r.id       AS chat_id,
      r.world_id AS world_id,
      COUNT(m.*)::int AS unread_messages
    FROM public.chatrooms r
    JOIN public.world_members wm ON wm.world_id = r.world_id AND wm.user_id = (SELECT id FROM u)
    LEFT JOIN public.chat_messages m ON m.chat_id = r.id
    LEFT JOIN public.chatroom_reads cr ON cr.chat_id = r.id AND cr.user_id = (SELECT id FROM u)
    WHERE
      m.id IS NULL
      OR (m.author_id <> (SELECT id FROM u) AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at))
    GROUP BY r.id, r.world_id
  ),

  notif_prefs AS (
    SELECT np.type, np.enabled
    FROM public.notification_preferences np
    WHERE np.user_id = (SELECT id FROM u)
  ),

  notifs AS (
    SELECT n.*, w.name AS world_name, w.icon_url AS world_icon_url
    FROM public.notifications n
    LEFT JOIN public.worlds w ON w.id = n.world_id
    WHERE n.recipient_id = (SELECT id FROM u) AND n.archived_at IS NULL
    ORDER BY n.updated_at DESC
    LIMIT p_notif_limit
  ),

  dms AS (
    SELECT
      c.id,
      CASE WHEN c.participant_a = (SELECT id FROM u) THEN c.participant_b ELSE c.participant_a END AS other_user_id,
      p.username   AS other_username,
      p.avatar_url AS other_avatar_url,
      c.last_message_at,
      c.created_at,
      (
        SELECT msg.content FROM public.dm_messages msg
        WHERE msg.conversation_id = c.id
        ORDER BY msg.created_at DESC LIMIT 1
      ) AS last_message_content,
      (
        SELECT msg.author_id FROM public.dm_messages msg
        WHERE msg.conversation_id = c.id
        ORDER BY msg.created_at DESC LIMIT 1
      ) AS last_message_author_id,
      (
        SELECT COUNT(*) FROM public.dm_messages msg
        WHERE msg.conversation_id = c.id
          AND msg.author_id != (SELECT id FROM u)
          AND msg.created_at > COALESCE(
            (SELECT r.last_read_at FROM public.dm_reads r
             WHERE r.conversation_id = c.id AND r.user_id = (SELECT id FROM u)),
            '1970-01-01'::timestamptz
          )
      ) AS unread_count
    FROM public.dm_conversations c
    JOIN public.profiles p ON p.id = CASE
      WHEN c.participant_a = (SELECT id FROM u) THEN c.participant_b
      ELSE c.participant_a
    END
    WHERE c.participant_a = (SELECT id FROM u)
       OR c.participant_b = (SELECT id FROM u)
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
  )

  SELECT jsonb_build_object(
    'world_ids', (SELECT COALESCE(jsonb_agg(world_id), '[]'::jsonb) FROM world_ids),
    'world_unreads', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'world_id', world_id, 'unread_messages', unread_messages, 'unread_rooms', unread_rooms
      )), '[]'::jsonb) FROM world_unreads
    ),
    'room_unreads', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'chat_id', chat_id, 'world_id', world_id, 'unread_messages', unread_messages
      )), '[]'::jsonb) FROM room_unreads
    ),
    'notification_preferences', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'type', type, 'enabled', enabled
      )), '[]'::jsonb) FROM notif_prefs
    ),
    'notifications', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'recipient_id', recipient_id, 'type', type, 'world_id', world_id,
        'chat_id', chat_id, 'message_id', message_id, 'actor_id', actor_id,
        'actor_name', actor_name, 'content', content, 'metadata', metadata,
        'read_at', read_at, 'archived_at', archived_at, 'created_at', created_at,
        'updated_at', updated_at,
        'world', CASE WHEN world_id IS NULL THEN NULL
                      ELSE jsonb_build_object('name', world_name, 'icon_url', world_icon_url) END
      )), '[]'::jsonb) FROM notifs
    ),
    'dm_conversations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'other_user_id', other_user_id, 'other_username', other_username,
        'other_avatar_url', other_avatar_url, 'last_message_at', last_message_at,
        'created_at', created_at, 'last_message_content', last_message_content,
        'last_message_author_id', last_message_author_id, 'unread_count', unread_count
      )), '[]'::jsonb) FROM dms
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_app_shell(int) TO authenticated;
