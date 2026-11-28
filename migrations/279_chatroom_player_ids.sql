-- ─────────────────────────────────────────────────────────────
-- Migration 279 — Joueurs d'un salon, pour l'ordre de passage
--
-- La fenêtre « Ordre de passage » proposait tous les membres du monde. Elle
-- ne propose plus que les joueurs du salon :
--   - les invités : joueurs des personas invités, directement ou par un
--     groupe (sous-groupes compris), comme `can_read_private_chatroom` ;
--   - les participants : auteurs d'au moins un message du salon, comme
--     `get_chatroom_stats` (participant_count) et `list_participated_chatrooms`.
--
-- Les PNJ invités ne comptent pas : leur joueur est le meneur, qui devient
-- participant dès qu'il poste. Seuls les membres du monde sont rendus
-- (propriétaire compris : un monde ancien peut ne pas avoir sa ligne).
-- Lisible par qui lit le salon (`can_read_chatroom`).
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_chatroom_player_ids(p_chat_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH room AS (
    SELECT c.id, c.world_id
      FROM public.chatrooms c
     WHERE c.id = p_chat_id
       AND public.can_read_chatroom(c.id, (SELECT auth.uid()))
  ),
  invited_personas AS (
    SELECT cp.persona_id AS id
      FROM public.chatroom_participants cp
      JOIN room ON room.id = cp.chatroom_id
     WHERE cp.persona_id IS NOT NULL
    UNION
    SELECT a.persona_id
      FROM public.chatroom_participants cp
      JOIN room ON room.id = cp.chatroom_id
     CROSS JOIN LATERAL public.persona_group_subtree(cp.group_id) s(id)
      JOIN public.persona_group_assignments a ON a.group_id = s.id
     WHERE cp.group_id IS NOT NULL
  ),
  players AS (
    SELECT p.user_id
      FROM invited_personas ip
      JOIN public.personas p ON p.id = ip.id
     WHERE p.deleted_at IS NULL
       AND p.is_npc IS NOT TRUE
    UNION
    SELECT m.author_id
      FROM public.chat_messages m
      JOIN room ON room.id = m.chat_id
  )
  SELECT COALESCE(array_agg(DISTINCT pl.user_id), '{}')
    FROM players pl, room
   WHERE pl.user_id IS NOT NULL
     AND (public.is_world_member(room.world_id, pl.user_id)
          OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = room.world_id AND w.owner_id = pl.user_id));
$$;

REVOKE EXECUTE ON FUNCTION public.list_chatroom_player_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_chatroom_player_ids(uuid) TO authenticated;
