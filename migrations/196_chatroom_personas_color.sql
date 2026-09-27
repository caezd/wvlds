-- ─────────────────────────────────────────────────────────────
-- Migration 196 — La couleur du groupe d'un persona, pour son fil
--
-- Filtrée par persona, la chronologie trace son fil : le fil de la frise
-- s'y colore, du premier au dernier salon où il a écrit, dans la couleur
-- de son groupe de personas. `get_chatroom_personas` (migration 193) la
-- renvoie donc aussi. Le type de retour change : la fonction est recréée.
-- ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_chatroom_personas(uuid);

CREATE FUNCTION public.get_chatroom_personas(p_world_id uuid)
RETURNS TABLE (chat_id uuid, persona_id uuid, persona_name text, group_color text)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT m.chat_id, m.persona_id, p.name, g.color
    FROM public.chat_messages m
    JOIN public.chatrooms c ON c.id = m.chat_id AND c.timeline_date IS NOT NULL
    JOIN public.personas p ON p.id = m.persona_id
    LEFT JOIN public.persona_group_assignments a ON a.persona_id = m.persona_id AND a.world_id = m.world_id
    LEFT JOIN public.world_persona_groups g ON g.id = a.group_id
   WHERE m.world_id = p_world_id
     AND m.persona_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_chatroom_personas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chatroom_personas(uuid) TO authenticated;
