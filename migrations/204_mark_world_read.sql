-- 204 — « Marquer comme lu » pour un monde entier.
--
-- Le menu contextuel d'un monde (sélecteur « Changer de monde », rail des
-- mondes) propose de vider d'un coup le badge du monde. Deux sources
-- l'alimentent, toutes deux traitées ici :
--
--  1. Les salons non lus ou jamais ouverts (`get_all_chatroom_unreads`, qui
--     lit `chatroom_reads`) : la position de lecture de CHAQUE salon du monde
--     passe à now(), horloge du serveur, avec GREATEST comme dans
--     `mark_chatroom_read` (migration 092) — elle ne recule jamais. Une ligne
--     créée pour un salon jamais ouvert le fait aussi sortir des « nouveaux ».
--  2. Les notifications du monde encore affichées : lues et archivées, comme
--     le fait le panneau pour une notification ouverte.
--
-- SECURITY INVOKER (défaut) : les RLS s'appliquent telles quelles.
--  - `chatrooms` n'est lisible que d'un membre du monde (is_world_member) :
--    le même ensemble de salons que celui que compte
--    `get_all_chatroom_unreads` ; un non-membre n'écrit rien.
--  - `chatroom_reads` et `notifications` n'acceptent que les lignes de
--    l'appelant (`user_id` / `recipient_id = auth.uid()`).
--
-- Code client : `markWorldRead` dans components/providers/NotificationsProvider.tsx.

CREATE OR REPLACE FUNCTION public.mark_world_read(p_world_id uuid)
RETURNS void
LANGUAGE sql
SET search_path TO 'public'
AS $$
  INSERT INTO public.chatroom_reads (chat_id, user_id, last_read_at)
  SELECT r.id, auth.uid(), now()
  FROM public.chatrooms r
  WHERE r.world_id = p_world_id
  ON CONFLICT (chat_id, user_id) DO UPDATE
    SET last_read_at = GREATEST(chatroom_reads.last_read_at, EXCLUDED.last_read_at);

  UPDATE public.notifications
  SET read_at = COALESCE(read_at, now()),
      archived_at = now()
  WHERE recipient_id = auth.uid()
    AND world_id = p_world_id
    AND archived_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_world_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_world_read(uuid) TO authenticated;
