-- ─────────────────────────────────────────────────────────────
-- Migration 192 — Qui a ouvert un salon, pour la chronologie
--
-- La chronologie d'un monde lit, à côté de chaque titre, « par Persona
-- (@pseudo) » : le persona sous lequel le premier message du salon a été
-- écrit, dans la couleur de son groupe de personas, et le membre qui l'a
-- écrit. Faute de message, « par @pseudo » : le compte qui a créé le salon.
--
-- SECURITY INVOKER : les politiques de lecture s'appliquent telles quelles.
-- Un message chuchoté (`visible_to`) qu'on ne voit pas n'ouvre donc pas le
-- salon pour soi ; le premier message lisible le fait.
--
-- Un premier message par salon, via l'index (chat_id, created_at) : un pas
-- d'index par salon daté, jamais un parcours des messages du monde.
-- ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_chatroom_openers(uuid);

CREATE FUNCTION public.get_chatroom_openers(p_world_id uuid)
RETURNS TABLE (chat_id uuid, author_name text, persona_name text, group_color text)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT c.id,
         pr.username,
         p.name,
         g.color
    FROM public.chatrooms c
    LEFT JOIN LATERAL (
      SELECT m.persona_id, m.author_id
        FROM public.chat_messages m
       WHERE m.chat_id = c.id
       ORDER BY m.created_at, m.id
       LIMIT 1
    ) first ON true
    LEFT JOIN public.profiles pr ON pr.id = COALESCE(first.author_id, c.created_by)
    LEFT JOIN public.personas p ON p.id = first.persona_id
    LEFT JOIN public.persona_group_assignments a ON a.persona_id = first.persona_id AND a.world_id = c.world_id
    LEFT JOIN public.world_persona_groups g ON g.id = a.group_id
   WHERE c.world_id = p_world_id
     AND c.timeline_date IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_chatroom_openers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chatroom_openers(uuid) TO authenticated;
