-- 091 — Le badge « nouvelle salle » se dérive de chatroom_reads
--
-- Avant : le badge venait de world_member_reads.last_seen_at (une date de
-- « dernière visite » par monde). Ouvrir le monde remettait tout à zéro, même
-- les salles jamais ouvertes — et la table dupliquait une information que
-- chatroom_reads porte déjà, salle par salle.
--
-- Après : `never_opened` = aucune ligne dans chatroom_reads pour cette salle,
-- et la salle n'a pas été créée par l'utilisateur lui-même. Une seule source de
-- vérité (chatroom_reads), un badge qui ne se vide qu'à l'ouverture réelle.
--
-- NOTE DE NUMÉROTATION : appliquée en base sous le nom
-- `unread_rooms_from_chatroom_reads` (version 20260717131702). Les commentaires
-- laissés en base la désignent comme « 075 », un numéro déjà pris par
-- 075_chat_choice_votes — erreur de l'auteur, sans effet sur le SQL appliqué.
-- 090 est allé à 090_persona_usable_quota : elle porte donc 091 dans le dépôt.
--
-- DÉPRÉCIATIONS À PURGER (une fois ce client déployé et les onglets rechargés) :
--   - public.get_world_unreads()  → plus aucun appelant
--   - public.world_member_reads   → plus aucun lecteur ni écrivain
--   - la clé 'world_unreads' du payload get_app_shell() (stub '[]' ci-dessous)

-- ── 1. get_all_chatroom_unreads : expose never_opened ────────────────────────

CREATE OR REPLACE FUNCTION public.get_all_chatroom_unreads()
RETURNS TABLE(chat_id uuid, world_id uuid, unread_messages integer, never_opened boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
   AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
  GROUP BY r.id, r.world_id, cr.chat_id
  HAVING COUNT(m.id) > 0
      OR COALESCE(cr.chat_id IS NULL AND r.created_by <> (SELECT id FROM u), false);
$function$;

-- ── 2. get_app_shell : même dérivation, world_unreads réduit à un stub ───────
-- 'world_unreads' est conservée à '[]' le temps que les onglets ouverts au
-- moment du déploiement se rechargent : un ancien client lit encore la clé et
-- planterait si elle disparaissait. À retirer ensuite.

CREATE OR REPLACE FUNCTION public.get_app_shell(p_notif_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
     AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
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

-- ── 3. Marquage de l'ancienne RPC ────────────────────────────────────────────

COMMENT ON FUNCTION public.get_world_unreads(uuid) IS
  'DÉSUET (075) — plus aucun appelant. Le badge de monde se dérive des lignes de get_all_chatroom_unreads/get_app_shell. À supprimer avec world_member_reads.';
