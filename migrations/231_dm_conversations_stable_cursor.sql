-- 231 — Pagination des conversations privées : un curseur qui ne perd rien.
--
-- Une annonce en message privé (migrations 227 à 230) crée des dizaines de
-- messages dans une seule transaction : ils ont tous le même `created_at`.
-- Or `get_dm_conversations` reprenait la page suivante avec la date seule
-- (`< p_cursor`) : les conversations à égalité avec la dernière ligne d'une
-- page n'apparaissaient jamais dans la liste de l'auteur.
--
-- Trois corrections, une seule clé de tri partout :
-- 1. La clé est la date du dernier message (ou de la conversation, si elle
--    est vide), départagée par l'identifiant de la conversation.
-- 2. `get_dm_conversations(p_cursor, p_limit, p_cursor_id)` reprend après le
--    couple (date, id). Sans `p_cursor_id` (client déjà chargé), elle garde
--    l'ancien comportement.
-- 3. `get_app_shell` (première page) trie avec la même clé. Avant, elle
--    triait sur `coalesce(last_message_at, created_at)`, colonne que rien
--    ne tient à jour (nulle partout) : la première page et les suivantes ne
--    suivaient pas le même ordre.
--
-- Les deux fonctions renvoient désormais cette clé dans `last_message_at` :
-- le client y lit son curseur (`last_message_at ?? created_at`) et trie
-- avec, sans changement de forme.

-- ── 1. get_dm_conversations ──────────────────────────────────
DROP FUNCTION IF EXISTS public.get_dm_conversations(timestamptz, integer);
CREATE OR REPLACE FUNCTION public.get_dm_conversations(
  p_cursor    timestamptz DEFAULT NULL,
  p_limit     integer DEFAULT 20,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  other_user_id uuid,
  other_username text,
  other_avatar_url text,
  last_message_at timestamptz,
  created_at timestamptz,
  last_message_content text,
  last_message_author_id uuid,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (SELECT auth.uid() AS id),
  convs AS (
    SELECT c.*,
           coalesce(
             (SELECT max(m.created_at) FROM public.dm_messages m WHERE m.conversation_id = c.id),
             c.created_at
           ) AS sort_at
      FROM public.dm_conversations c
     WHERE c.participant_a = (SELECT id FROM me) OR c.participant_b = (SELECT id FROM me)
  )
  SELECT
    c.id,
    CASE WHEN c.participant_a = (SELECT id FROM me) THEN c.participant_b ELSE c.participant_a END,
    p.username,
    p.avatar_url,
    c.sort_at,
    c.created_at,
    (SELECT msg.content FROM public.dm_messages msg
      WHERE msg.conversation_id = c.id ORDER BY msg.created_at DESC, msg.id DESC LIMIT 1),
    (SELECT msg.author_id FROM public.dm_messages msg
      WHERE msg.conversation_id = c.id ORDER BY msg.created_at DESC, msg.id DESC LIMIT 1),
    (SELECT count(*) FROM public.dm_messages msg
      WHERE msg.conversation_id = c.id
        AND msg.author_id <> (SELECT id FROM me)
        AND msg.created_at > coalesce(
          (SELECT r.last_read_at FROM public.dm_reads r
            WHERE r.conversation_id = c.id AND r.user_id = (SELECT id FROM me)),
          '1970-01-01'::timestamptz))
  FROM convs c
  JOIN public.profiles p ON p.id = CASE
    WHEN c.participant_a = (SELECT id FROM me) THEN c.participant_b ELSE c.participant_a END
  WHERE p_cursor IS NULL
     OR (p_cursor_id IS NULL AND c.sort_at < p_cursor)
     OR (p_cursor_id IS NOT NULL AND (c.sort_at, c.id) < (p_cursor, p_cursor_id))
  ORDER BY c.sort_at DESC, c.id DESC
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.get_dm_conversations(timestamptz, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dm_conversations(timestamptz, integer, uuid) TO authenticated;

-- ── 2. get_app_shell : la première page, même clé ────────────
CREATE OR REPLACE FUNCTION public.get_app_shell(p_notif_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH u AS (SELECT auth.uid() AS id),

  world_ids AS (
    SELECT wm.world_id
    FROM public.world_members wm
    WHERE wm.user_id = (SELECT id FROM u)
  ),

  room_unreads AS (
    SELECT
      r.id       AS chat_id,
      r.world_id AS world_id,
      COUNT(m.id)::int AS unread_messages,
      COALESCE(cr.chat_id IS NULL AND r.created_by <> (SELECT id FROM u), false) AS never_opened
    FROM public.chatrooms r
    JOIN public.world_members wm
      ON wm.world_id = r.world_id AND wm.user_id = (SELECT id FROM u)
    LEFT JOIN public.chatroom_reads cr
      ON cr.chat_id = r.id AND cr.user_id = (SELECT id FROM u)
    LEFT JOIN public.chat_messages m
      ON m.chat_id = r.id
     AND m.author_id <> (SELECT id FROM u)
     AND (cr.last_read_at IS NULL
          OR m.created_at > cr.last_read_at
          OR (m.inserted_at IS NOT NULL AND m.inserted_at > cr.last_read_at))
    WHERE r.visibility <> 'private' OR public.can_read_private_chatroom(r.id, (SELECT id FROM u))
    GROUP BY r.id, r.world_id, cr.chat_id
    HAVING COUNT(m.id) > 0
        OR COALESCE(cr.chat_id IS NULL AND r.created_by <> (SELECT id FROM u), false)
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

  -- Migration 231 : même clé et même départage que get_dm_conversations.
  convs AS (
    SELECT c.*,
           coalesce(
             (SELECT max(m.created_at) FROM public.dm_messages m WHERE m.conversation_id = c.id),
             c.created_at
           ) AS sort_at
      FROM public.dm_conversations c
     WHERE c.participant_a = (SELECT id FROM u)
        OR c.participant_b = (SELECT id FROM u)
  ),

  dms AS (
    SELECT
      c.id,
      CASE WHEN c.participant_a = (SELECT id FROM u) THEN c.participant_b ELSE c.participant_a END AS other_user_id,
      p.username   AS other_username,
      p.avatar_url AS other_avatar_url,
      c.sort_at    AS last_message_at,
      c.created_at,
      (
        SELECT msg.content FROM public.dm_messages msg
        WHERE msg.conversation_id = c.id
        ORDER BY msg.created_at DESC, msg.id DESC LIMIT 1
      ) AS last_message_content,
      (
        SELECT msg.author_id FROM public.dm_messages msg
        WHERE msg.conversation_id = c.id
        ORDER BY msg.created_at DESC, msg.id DESC LIMIT 1
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
    FROM convs c
    JOIN public.profiles p ON p.id = CASE
      WHEN c.participant_a = (SELECT id FROM u) THEN c.participant_b
      ELSE c.participant_a
    END
    ORDER BY c.sort_at DESC, c.id DESC
    LIMIT 20
  )

  SELECT jsonb_build_object(
    'world_ids', (SELECT COALESCE(jsonb_agg(world_id), '[]'::jsonb) FROM world_ids),
    'world_unreads', '[]'::jsonb,
    'room_unreads', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'chat_id', chat_id, 'world_id', world_id,
        'unread_messages', unread_messages, 'never_opened', never_opened
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
        'actor_name', actor_name, 'persona_id', persona_id, 'content', content, 'metadata', metadata,
        'read_at', read_at, 'archived_at', archived_at, 'created_at', created_at,
        'updated_at', updated_at,
        'world', CASE WHEN world_id IS NULL THEN NULL
                      ELSE jsonb_build_object('name', world_name, 'icon_url', world_icon_url) END
      )), '[]'::jsonb) FROM notifs
    ),
    -- L'ordre est explicite : le client prend la dernière ligne comme curseur.
    'dm_conversations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'other_user_id', other_user_id, 'other_username', other_username,
        'other_avatar_url', other_avatar_url, 'last_message_at', last_message_at,
        'created_at', created_at, 'last_message_content', last_message_content,
        'last_message_author_id', last_message_author_id, 'unread_count', unread_count
      ) ORDER BY last_message_at DESC, id DESC), '[]'::jsonb) FROM dms
    )
  );
$$;

-- Vérification :
-- SELECT pg_get_function_identity_arguments('public.get_dm_conversations'::regproc);
--   → p_cursor timestamp with time zone, p_limit integer, p_cursor_id uuid
