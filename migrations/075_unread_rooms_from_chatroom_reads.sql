-- ============================================================
-- Migration 075 — le badge « nouvelle salle » suit la lecture, plus la visite
-- ============================================================
-- BUG CORRIGÉ — pastille de monde impossible à effacer.
--
-- Jusqu'ici, la part « salles jamais vues » du badge de monde se calculait
-- ainsi :
--     chatrooms.created_at > world_member_reads.last_seen_at
-- Ce prédicat ne consulte JAMAIS chatroom_reads : lire la salle ne le
-- décrémentait donc pas. Le seul reset était markWorldSeen(), appelé
-- uniquement par WorldHeroCard — c'est-à-dire par la vue d'accueil du monde,
-- et par elle seule.
--
-- Or notifHref() envoie toute notification portant un chat_id vers /c/{id}.
-- Un joueur qui clique une notification depuis son centre de notifications
-- atterrit dans la salle sans passer par l'accueil : il lit tout, et la
-- pastille reste — jusqu'à ce qu'il repasse un jour par l'accueil du monde.
-- Mesuré en prod avant correctif : des fenêtres de 3 h à 22 h passées hors de
-- l'accueil, pour ~1 salle créée tous les 2-3 jours par monde actif.
--
-- CORRECTIF — une salle est « neuve » tant qu'elle n'a pas de ligne dans
-- chatroom_reads. Entrer dans la salle écrit cette ligne (markChatRead), donc
-- le compteur s'efface quel que soit le chemin emprunté. Le signal devient
-- auto-cohérent et world_member_reads sort du calcul.
--
-- Au passage : fin du double comptage. Une salle neuve comptait +1 (salle) ET
-- ses N messages — 12 pour 11 messages. Le client applique désormais
-- max(messages non lus, 1 si jamais ouverte), d'où le drapeau `never_opened`
-- exposé par ligne de salle.
--
-- Note : `created_by <> uid` (et non IS DISTINCT FROM) préserve exactement la
-- sémantique d'avant — created_by étant nullable, une salle sans créateur
-- n'est pas signalée comme neuve. Changement de comportement volontairement
-- exclu de ce correctif.

-- ── 1. get_app_shell : room_unreads gagne `never_opened` ─────────────────────

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

  -- Une ligne par salle « intéressante » : au moins un message non lu, ou
  -- jamais ouverte. Les salles entièrement lues sont omises (le client les
  -- interprète comme 0), ce qui garde la charge utile courte.
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
    -- Stub de compatibilité : un onglet resté ouvert pendant le déploiement
    -- tourne encore sur l'ancien client, qui itère sur cette clé sans garde.
    -- Un tableau vide le laisse fonctionner (badges sous-comptés jusqu'au
    -- rechargement) au lieu de le faire planter. À retirer au prochain jalon.
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
$$;

GRANT EXECUTE ON FUNCTION public.get_app_shell(int) TO authenticated;

-- ── 2. get_all_chatroom_unreads : même contrat (resync de refreshAll) ────────

DROP FUNCTION IF EXISTS public.get_all_chatroom_unreads();

CREATE FUNCTION public.get_all_chatroom_unreads()
RETURNS TABLE(chat_id uuid, world_id uuid, unread_messages integer, never_opened boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_all_chatroom_unreads() TO authenticated;

-- ── 3. get_world_unreads devient sans objet ─────────────────────────────────
-- Plus aucun appelant : le badge de monde se dérive entièrement des lignes de
-- salle côté client. La fonction lisait world_member_reads, dernière lecture
-- de cette table. On la laisse en place le temps que les onglets ouverts se
-- rechargent ; sa suppression (et celle de world_member_reads) est à faire
-- dans un second temps.

COMMENT ON FUNCTION public.get_world_unreads() IS
  'DÉSUET (075) — plus aucun appelant. Le badge de monde se dérive des lignes '
  'de get_all_chatroom_unreads/get_app_shell. À supprimer avec world_member_reads.';
