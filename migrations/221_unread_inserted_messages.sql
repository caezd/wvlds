-- 221 — Non-lus : un message « inséré avant » compte comme nouveau.
--
-- Un message inséré (migration 216) reçoit une date `created_at` dans le passé,
-- juste avant sa cible, et garde sa vraie date d'envoi dans `inserted_at`. Les
-- non-lus comparaient `created_at` à la position de lecture : si les autres
-- avaient déjà lu cette partie du fil, l'inséré ne comptait pas. En direct, le
-- badge montait de 1 (avis diffusé), puis retombait au rechargement — certains
-- ne voyaient jamais passer la réplique insérée.
--
-- 1. Comptage : un message est non lu si sa place dans le fil (`created_at`) OU
--    sa date réelle d'envoi (`inserted_at`) est postérieure à la lecture.
--    Écrit en deux branches (et non `COALESCE(inserted_at, created_at)`) pour
--    garder l'index (chat_id, created_at) et profiter du petit index partiel
--    ci-dessous.
--
-- 2. Marquage « lu » : le client envoie la date du DERNIER message affiché. Un
--    inséré se place plus haut dans le fil, mais sa date d'envoi est plus
--    récente : sans correction, il resterait non lu pour toujours. La position
--    de lecture couvre donc aussi la date d'envoi des insérés situés dans la
--    partie lue du fil (`created_at` <= date envoyée). `GREATEST` garde
--    l'écriture monotone (migration 092).

CREATE INDEX IF NOT EXISTS chat_messages_chat_id_inserted_at_idx
  ON public.chat_messages (chat_id, inserted_at)
  WHERE inserted_at IS NOT NULL;

-- ── Marquage « lu » ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_chatroom_read(
  p_chat_id      uuid,
  p_last_read_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SET search_path TO 'public'
AS $$
  INSERT INTO public.chatroom_reads (chat_id, user_id, last_read_at)
  VALUES (
    p_chat_id,
    auth.uid(),
    CASE
      WHEN p_last_read_at IS NULL THEN now()
      ELSE GREATEST(
        p_last_read_at,
        (SELECT max(m.inserted_at)
         FROM public.chat_messages m
         WHERE m.chat_id = p_chat_id
           AND m.inserted_at IS NOT NULL
           AND m.created_at <= p_last_read_at)
      )
    END
  )
  ON CONFLICT (chat_id, user_id) DO UPDATE
    SET last_read_at = GREATEST(chatroom_reads.last_read_at, EXCLUDED.last_read_at);
$$;

-- ── Comptages ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_all_chatroom_unreads()
 RETURNS TABLE(chat_id uuid, world_id uuid, unread_messages integer, never_opened boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH u AS (SELECT auth.uid() AS id)
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
  GROUP BY r.id, r.world_id, cr.chat_id
  HAVING COUNT(m.id) > 0
      OR COALESCE(cr.chat_id IS NULL AND r.created_by <> (SELECT id FROM u), false);
$function$;

CREATE OR REPLACE FUNCTION public.get_chatroom_unreads(wid uuid)
 RETURNS TABLE(chat_id uuid, unread_messages integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH u AS (SELECT auth.uid() AS id)
  SELECT r.id AS chat_id,
         COUNT(m.*)::int AS unread_messages
  FROM public.chatrooms r
  LEFT JOIN public.chat_messages m
    ON m.chat_id = r.id
  LEFT JOIN public.chatroom_reads cr
    ON cr.chat_id = r.id AND cr.user_id = (SELECT id FROM u)
  WHERE r.world_id = wid
    AND (m.id IS NULL OR (m.author_id <> (SELECT id FROM u)
         AND (cr.last_read_at IS NULL
              OR m.created_at > cr.last_read_at
              OR (m.inserted_at IS NOT NULL AND m.inserted_at > cr.last_read_at))))
  GROUP BY r.id;
$function$;

CREATE OR REPLACE FUNCTION public.list_chatrooms_nav(p_world_id uuid)
 RETURNS TABLE(id uuid, title text, name text, icon_url text, last_message_at timestamp with time zone, last_message_excerpt text, unread_count integer, category_id uuid, last_poster_avatar_url text, last_poster_id uuid, participant_count integer, second_poster_avatar_url text, timeline_date jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    r.id,
    r.title,
    r.name,
    r.icon_url,
    s.last_message_at,
    s.last_message_excerpt,
    COALESCE((
      SELECT COUNT(*)::int
      FROM public.chat_messages m
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          (SELECT cr.last_read_at FROM public.chatroom_reads cr
           WHERE cr.chat_id = r.id AND cr.user_id = auth.uid()),
          '-infinity'::timestamptz) AS lu
      ) lr
      WHERE m.chat_id = r.id
        AND m.author_id <> auth.uid()
        AND (m.created_at > lr.lu
             OR (m.inserted_at IS NOT NULL AND m.inserted_at > lr.lu))
    ), 0) AS unread_count,
    r.category_id,
    COALESCE(s.last_message_persona_avatar_url, p.avatar_url) AS last_poster_avatar_url,
    s.last_message_author_id                                   AS last_poster_id,
    (SELECT COUNT(DISTINCT cm.author_id)::int
     FROM public.chat_messages cm
     WHERE cm.chat_id = r.id
       AND (auth.uid() IS NULL OR cm.author_id <> auth.uid())
    ) AS participant_count,
    (SELECT COALESCE(pn.avatar_url, p2.avatar_url)
     FROM public.chat_messages cm2
     LEFT JOIN public.profiles p2 ON p2.id = cm2.author_id
     LEFT JOIN public.personas pn ON pn.id = cm2.persona_id
     WHERE cm2.chat_id = r.id
       AND (auth.uid() IS NULL OR cm2.author_id <> auth.uid())
       AND (s.last_message_author_id IS NULL OR cm2.author_id <> s.last_message_author_id)
     ORDER BY cm2.created_at DESC
     LIMIT 1
    ) AS second_poster_avatar_url,
    r.timeline_date
  FROM public.chatrooms r
  LEFT JOIN public.chatroom_summaries s ON s.chat_id = r.id
  LEFT JOIN public.profiles p ON p.id = s.last_message_author_id
  WHERE r.world_id = p_world_id
    AND (
      EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = p_world_id AND wm.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.owner_id = auth.uid())
    )
  ORDER BY COALESCE(s.last_message_at, r.updated_at) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.list_participated_chatrooms(p_world_id uuid, p_limit integer DEFAULT 3)
 RETURNS TABLE(id uuid, title text, name text, icon_url text, last_message_at timestamp with time zone, has_unread boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    c.id,
    c.title,
    c.name,
    c.icon_url,
    last_msg.ts                                        AS last_message_at,
    CASE
      WHEN cr.last_read_at IS NULL THEN (last_msg.ts IS NOT NULL)
      ELSE GREATEST(last_msg.ts, last_ins.ts) > cr.last_read_at
    END                                                AS has_unread
  FROM chatrooms c
  LEFT JOIN LATERAL (
    SELECT MAX(cm.created_at) AS ts
    FROM chat_messages cm
    WHERE cm.chat_id = c.id
  ) last_msg ON true
  LEFT JOIN LATERAL (
    SELECT MAX(cm.inserted_at) AS ts
    FROM chat_messages cm
    WHERE cm.chat_id = c.id AND cm.inserted_at IS NOT NULL
  ) last_ins ON true
  LEFT JOIN chatroom_reads cr
    ON cr.chat_id = c.id AND cr.user_id = auth.uid()
  WHERE c.world_id = p_world_id
    AND EXISTS (
      SELECT 1
      FROM chat_messages cm2
      WHERE cm2.chat_id = c.id
        AND cm2.author_id = auth.uid()
    )
  ORDER BY last_msg.ts DESC NULLS LAST
  LIMIT p_limit
$function$;

-- Chargement initial de l'application : même comptage pour `room_unreads`
-- (le reste de la fonction est inchangé, cf. migration 073).
CREATE OR REPLACE FUNCTION public.get_app_shell(p_notif_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    'dm_conversations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'other_user_id', other_user_id, 'other_username', other_username,
        'other_avatar_url', other_avatar_url, 'last_message_at', last_message_at,
        'created_at', created_at, 'last_message_content', last_message_content,
        'last_message_author_id', last_message_author_id, 'unread_count', unread_count
      )), '[]'::jsonb) FROM dms
    )
  );
$function$;
