-- Pagination de la liste de conversations DM + correctif de sécurité.
--
-- 0. CORRECTIF : les migrations 100/101 avaient fait REVOKE ALL ... FROM
--    PUBLIC sur les RPC DM, en pensant que ça suffisait à empêcher `anon` de
--    les exécuter. En pratique Supabase accorde EXECUTE directement à `anon`
--    (pas seulement via PUBLIC) à la création de toute fonction du schéma
--    public — un simple REVOKE FROM PUBLIC ne retire donc pas ce droit direct.
--    Vérifié en base : les 6 fonctions restaient exécutables par `anon`.
--    On révoque ici explicitement FROM anon (en plus de PUBLIC) sur les 6
--    fonctions DM/blocage existantes.
--
-- 1. get_dm_conversations() renvoyait TOUTES les conversations de
--    l'utilisateur sans limite. Ajoute un curseur (p_cursor) + une limite
--    (p_limit, défaut 20). Le curseur attendu par le client est
--    COALESCE(last_message_at, created_at) de la dernière conversation reçue
--    — exactement le calcul que fait déjà sortByLastMessage() côté client
--    (DmsProvider.tsx), donc aucune colonne supplémentaire à exposer.
--
-- 2. Le bloc `dms` de get_app_shell() (bootstrap) est plafonné à 20
--    conversations pour la même raison — la pagination ne sert à rien si la
--    première page charge déjà tout.

-- ── 0. Correctif anon sur les fonctions existantes ───────────────────────────

REVOKE EXECUTE ON FUNCTION public.find_or_create_dm(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_common_worlds(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.block_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unblock_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_dm_users(text) FROM anon;

-- ── 1. get_dm_conversations paginée ───────────────────────────────────────────
-- Changement de signature : on DROP l'ancienne (zéro argument) puis on
-- recrée avec des paramètres à valeur par défaut, pour qu'il n'existe qu'une
-- seule fonction (pas de surcharge ambiguë) et que les deux valeurs par
-- défaut permettent toujours un appel sans argument.

DROP FUNCTION IF EXISTS public.get_dm_conversations();

CREATE FUNCTION get_dm_conversations(p_cursor timestamptz DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE (
  id                     uuid,
  other_user_id          uuid,
  other_username         text,
  other_avatar_url       text,
  last_message_at        timestamptz,
  created_at             timestamptz,
  last_message_content   text,
  last_message_author_id uuid,
  unread_count           bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id,
    CASE WHEN c.participant_a = (SELECT auth.uid()) THEN c.participant_b ELSE c.participant_a END AS other_user_id,
    p.username   AS other_username,
    p.avatar_url AS other_avatar_url,
    c.last_message_at,
    c.created_at,
    (
      SELECT msg.content FROM dm_messages msg
      WHERE msg.conversation_id = c.id
      ORDER BY msg.created_at DESC LIMIT 1
    ) AS last_message_content,
    (
      SELECT msg.author_id FROM dm_messages msg
      WHERE msg.conversation_id = c.id
      ORDER BY msg.created_at DESC LIMIT 1
    ) AS last_message_author_id,
    (
      SELECT count(*) FROM dm_messages msg
      WHERE msg.conversation_id = c.id
        AND msg.author_id != (SELECT auth.uid())
        AND msg.created_at > COALESCE(
          (SELECT r.last_read_at FROM dm_reads r
           WHERE r.conversation_id = c.id AND r.user_id = (SELECT auth.uid())),
          '1970-01-01'::timestamptz
        )
    ) AS unread_count
  FROM dm_conversations c
  JOIN profiles p ON p.id = CASE
    WHEN c.participant_a = (SELECT auth.uid()) THEN c.participant_b
    ELSE c.participant_a
  END
  WHERE (c.participant_a = (SELECT auth.uid()) OR c.participant_b = (SELECT auth.uid()))
    AND (
      p_cursor IS NULL
      OR COALESCE(
        (SELECT max(m.created_at) FROM dm_messages m WHERE m.conversation_id = c.id),
        c.created_at
      ) < p_cursor
    )
  ORDER BY COALESCE(
    (SELECT max(m.created_at) FROM dm_messages m WHERE m.conversation_id = c.id),
    c.created_at
  ) DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.get_dm_conversations(timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dm_conversations(timestamptz, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dm_conversations(timestamptz, integer) TO authenticated;

-- ── 2. get_app_shell : première page seulement pour le bloc dms ─────────────
-- Même signature qu'avant (p_notif_limit) : CREATE OR REPLACE préserve les
-- grants existants, pas besoin de les réémettre.

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
    -- Première page seulement (voir get_dm_conversations pour la suite,
    -- paginée via p_cursor) : le bootstrap ne doit pas charger la totalité
    -- des conversations d'un utilisateur qui en a beaucoup.
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

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- (recréer get_dm_conversations() sans argument depuis la migration 044/100)
-- (recréer get_app_shell sans LIMIT 20 sur la CTE dms depuis la migration 091)
-- GRANT EXECUTE ON FUNCTION public.find_or_create_dm(uuid) TO anon;
-- GRANT EXECUTE ON FUNCTION public.count_common_worlds(uuid) TO anon;
-- GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO anon;
-- GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO anon;
-- GRANT EXECUTE ON FUNCTION public.search_dm_users(text) TO anon;
