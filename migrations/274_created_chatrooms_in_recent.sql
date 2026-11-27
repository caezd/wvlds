-- ============================================================
-- Migration 274 — Le salon qu'on crée compte parmi les récents
-- ============================================================
-- La section « Récents » de la barre latérale (list_participated_chatrooms)
-- ne retenait que les salons où l'on avait écrit : un salon tout juste créé,
-- encore vide, n'y figurait pas. Créer un salon, c'est y jouer.
--
-- Un salon sans message se range à sa date de création — sur le serveur
-- comme dans la barre latérale, qui retrie sa liste à chaque avis du canal
-- du monde. D'où `created_at` :
--   - en dernière colonne de `list_chatrooms_nav` (type de retour changé :
--     DROP + CREATE, comme la migration 205) ;
--   - dans l'avis `chatroom` du canal du monde (salon non privé).
-- Le tri de `list_chatrooms_nav` passe de `updated_at` à `created_at` pour
-- les salons vides : renommer un salon ne le remonte plus.
--
-- Déploiement : le code lit `created_at` s'il est là ; sans lui, un salon
-- vide se range après ceux qui ont des messages, comme avant.

-- ── list_participated_chatrooms : salons créés compris ────────
CREATE OR REPLACE FUNCTION public.list_participated_chatrooms(p_world_id uuid, p_limit integer DEFAULT 3)
RETURNS TABLE(id uuid, title text, name text, icon_url text, last_message_at timestamp with time zone, has_unread boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    AND (
      c.created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM chat_messages cm2
        WHERE cm2.chat_id = c.id
          AND cm2.author_id = auth.uid()
      )
    )
    AND public.can_read_chatroom(c.id, auth.uid())
  ORDER BY COALESCE(last_msg.ts, c.created_at) DESC NULLS LAST
  LIMIT p_limit
$$;

-- ── list_chatrooms_nav : + created_at ─────────────────────────
-- Corps de la migration 225 (identique à la production), plus `created_at`
-- en dernière colonne et dans le tri.
DROP FUNCTION IF EXISTS public.list_chatrooms_nav(uuid);

CREATE FUNCTION public.list_chatrooms_nav(p_world_id uuid)
RETURNS TABLE(id uuid, title text, name text, icon_url text, last_message_at timestamp with time zone, last_message_excerpt text, unread_count integer, category_id uuid, last_poster_avatar_url text, last_poster_id uuid, participant_count integer, second_poster_avatar_url text, timeline_date jsonb, created_at timestamp with time zone)
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
    r.created_at
  FROM salons r
  LEFT JOIN public.chatroom_summaries s ON s.chat_id = r.id
  LEFT JOIN public.profiles p ON p.id = s.last_message_author_id
  LEFT JOIN stats st ON st.chat_id = r.id
  ORDER BY COALESCE(s.last_message_at, r.created_at) DESC, r.created_at DESC, r.id;
$$;

-- Le DROP a emporté les droits d'exécution : ceux d'avant.
GRANT EXECUTE ON FUNCTION public.list_chatrooms_nav(uuid) TO anon, authenticated, service_role;

-- ── Avis `chatroom` du canal du monde : + created_at ──────────
CREATE OR REPLACE FUNCTION public.broadcast_world_chatroom()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.chatrooms%ROWTYPE;
  prive boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF TG_OP = 'UPDATE' AND
     (NEW.world_id, NEW.title, NEW.name, NEW.tag, NEW.banner_url, NEW.icon_url, NEW.category_id,
      NEW.timeline_date, NEW.map_pin_id, NEW.arc_id, NEW.status, NEW.visibility)
     IS NOT DISTINCT FROM
     (OLD.world_id, OLD.title, OLD.name, OLD.tag, OLD.banner_url, OLD.icon_url, OLD.category_id,
      OLD.timeline_date, OLD.map_pin_id, OLD.arc_id, OLD.status, OLD.visibility) THEN
    RETURN NULL;
  END IF;
  -- Privé avant ou après : ni titre ni icône sur le canal du monde ; le
  -- client relit sa liste, filtrée par list_chatrooms_nav.
  prive := r.visibility = 'private' OR (TG_OP = 'UPDATE' AND OLD.visibility = 'private');
  IF r.world_id IS NOT NULL THEN
    IF prive THEN
      PERFORM public.wvlds_notify('world:' || r.world_id::text, 'chatroom',
        jsonb_build_object('op', TG_OP, 'id', r.id, 'private', true));
    ELSE
      PERFORM public.wvlds_notify('world:' || r.world_id::text, 'chatroom',
        jsonb_build_object('op', TG_OP, 'id', r.id, 'title', r.title, 'name', r.name,
                           'icon_url', r.icon_url, 'category_id', r.category_id,
                           'created_at', r.created_at));
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.world_id IS DISTINCT FROM NEW.world_id AND OLD.world_id IS NOT NULL THEN
    PERFORM public.wvlds_notify('world:' || OLD.world_id::text, 'chatroom',
      jsonb_build_object('op', 'DELETE', 'id', OLD.id));
  END IF;
  RETURN NULL;
END;
$$;

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Rejouer les trois définitions de la migration 225 (list_chatrooms_nav
-- après un DROP FUNCTION public.list_chatrooms_nav(uuid), puis le GRANT
-- ci-dessus).
