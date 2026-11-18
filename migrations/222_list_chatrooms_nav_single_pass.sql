-- 222 — `list_chatrooms_nav` : un seul passage sur les messages.
--
-- La requête la plus coûteuse de l'application (statistiques de la base) :
-- appelée à chaque page de monde et de salon, et au retour d'une veille pour
-- resynchroniser la barre latérale. Pour CHAQUE salon, elle relançait deux
-- sous-requêtes sur ses messages — non-lus, puis auteurs distincts. Les deux
-- comptages sont maintenant faits en un seul passage groupé sur les messages
-- des salons du monde (`FILTER`), et la position de lecture n'est plus relue
-- message par message.
--
-- Résultat vérifié identique à la version précédente (migration 221) sur tous
-- les couples membre/monde, le propriétaire, un non-membre et un visiteur
-- anonyme : mêmes lignes, même ordre par date.
--
-- Seul changement visible : à date égale (salons sans message créés en lot),
-- l'ordre n'était pas défini — Postgres pouvait le changer d'un appel à
-- l'autre. Il est désormais stable : le salon créé le plus récemment d'abord.

CREATE OR REPLACE FUNCTION public.list_chatrooms_nav(p_world_id uuid)
 RETURNS TABLE(id uuid, title text, name text, icon_url text, last_message_at timestamp with time zone, last_message_excerpt text, unread_count integer, category_id uuid, last_poster_avatar_url text, last_poster_id uuid, participant_count integer, second_poster_avatar_url text, timeline_date jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH moi AS (SELECT auth.uid() AS uid),
  salons AS (
    SELECT r.*
    FROM public.chatrooms r
    WHERE r.world_id = p_world_id
      AND (
        EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = p_world_id AND wm.user_id = (SELECT uid FROM moi))
        OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.owner_id = (SELECT uid FROM moi))
      )
  ),
  -- Un passage sur les messages des salons du monde : non-lus (migration 221 :
  -- place dans le fil OU date réelle d'envoi après la lecture) et auteurs
  -- distincts, hors soi-même.
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
    -- Avant-dernier posteur : le plus récent message d'un autre auteur. Lu
    -- par l'index (chat_id, created_at) à rebours, arrêté au premier trouvé.
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
    r.timeline_date
  FROM salons r
  LEFT JOIN public.chatroom_summaries s ON s.chat_id = r.id
  LEFT JOIN public.profiles p ON p.id = s.last_message_author_id
  LEFT JOIN stats st ON st.chat_id = r.id
  ORDER BY COALESCE(s.last_message_at, r.updated_at) DESC, r.created_at DESC, r.id;
$function$;
