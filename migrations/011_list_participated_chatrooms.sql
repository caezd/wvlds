-- ============================================================
-- Migration 011 — list_participated_chatrooms
-- Retourne les chatrooms d'un monde où l'utilisateur courant
-- a posté au moins un message, triés par dernière activité.
-- Utilisé dans la sidebar pour les mondes favoris.
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_participated_chatrooms(
  p_world_id uuid,
  p_limit    int DEFAULT 3
)
RETURNS TABLE (
  id              uuid,
  title           text,
  name            text,
  icon_url        text,
  last_message_at timestamptz,
  has_unread      boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.title,
    c.name,
    c.icon_url,
    last_msg.ts                                        AS last_message_at,
    CASE
      WHEN cr.last_read_at IS NULL THEN (last_msg.ts IS NOT NULL)
      ELSE last_msg.ts > cr.last_read_at
    END                                                AS has_unread
  FROM chatrooms c
  LEFT JOIN LATERAL (
    SELECT MAX(cm.created_at) AS ts
    FROM chat_messages cm
    WHERE cm.chat_id = c.id
  ) last_msg ON true
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
$$;
