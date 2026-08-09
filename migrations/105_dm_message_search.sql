-- Recherche dans l'historique des messages privés.
-- dm_messages.content est stocké en clair côté serveur (pas de chiffrement
-- client contrairement à chat_messages), une recherche serveur simple est
-- donc possible. Même approche ILIKE que search_dm_users (migration 101) —
-- pas de full-text/tsvector : aucune autre partie du projet n'en utilise, et
-- le volume par utilisateur (messagerie personnelle) reste modeste.

CREATE FUNCTION search_dm_messages(p_query text, p_limit integer DEFAULT 30)
RETURNS TABLE (
  id                bigint,
  conversation_id   uuid,
  author_id         uuid,
  content           text,
  created_at        timestamptz,
  other_user_id     uuid,
  other_username    text,
  other_avatar_url  text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.id, m.conversation_id, m.author_id, m.content, m.created_at,
    CASE WHEN c.participant_a = (SELECT auth.uid()) THEN c.participant_b ELSE c.participant_a END AS other_user_id,
    p.username   AS other_username,
    p.avatar_url AS other_avatar_url
  FROM dm_messages m
  JOIN dm_conversations c ON c.id = m.conversation_id
  JOIN profiles p ON p.id = CASE
    WHEN c.participant_a = (SELECT auth.uid()) THEN c.participant_b
    ELSE c.participant_a
  END
  WHERE (c.participant_a = (SELECT auth.uid()) OR c.participant_b = (SELECT auth.uid()))
    AND m.content ILIKE '%' || p_query || '%'
  ORDER BY m.created_at DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.search_dm_messages(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_dm_messages(text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_dm_messages(text, integer) TO authenticated;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.search_dm_messages(text, integer);
