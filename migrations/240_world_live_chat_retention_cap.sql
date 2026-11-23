-- 240 — Chatbox : 100 messages au plus par salle.
--
-- Tout ce que la base garde se consulte en remontant le fil de la chatbox ;
-- ce qui dépasse est effacé (délestage, migration 239). Le plafond de ce
-- qu'un monde peut garder — donc charger — passe de 1000 à 100 messages par
-- salle, le défaut de 500 à 100. Paliers proposés : 25, 50, 100
-- (lib/worldLiveChatRetention.ts).
--
-- Les mondes au-dessus de 100 y redescendent : le trigger de la migration
-- 239 déleste aussitôt chacune de leurs salles.

ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_live_chat_retention_range;

UPDATE public.worlds SET live_chat_retention = 100 WHERE live_chat_retention > 100;

ALTER TABLE public.worlds ALTER COLUMN live_chat_retention SET DEFAULT 100;
ALTER TABLE public.worlds
  ADD CONSTRAINT worlds_live_chat_retention_range CHECK (live_chat_retention BETWEEN 25 AND 100);

-- Délestage à l'envoi : même logique qu'en 239, défaut et plafond à 100.
CREATE OR REPLACE FUNCTION public.tg_world_live_message_prune()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keep   integer;
  v_cutoff timestamptz;
BEGIN
  SELECT w.live_chat_retention INTO v_keep FROM public.worlds w WHERE w.id = NEW.world_id;
  v_keep := least(coalesce(v_keep, 100), 100);

  IF NEW.channel_id IS NOT NULL THEN
    SELECT m.created_at INTO v_cutoff FROM public.world_live_messages m
     WHERE m.channel_id = NEW.channel_id
     ORDER BY m.created_at DESC OFFSET v_keep LIMIT 1;
    IF v_cutoff IS NOT NULL THEN
      DELETE FROM public.world_live_messages m
       WHERE m.channel_id = NEW.channel_id AND m.created_at <= v_cutoff;
    END IF;
  ELSIF NEW.chatroom_id IS NOT NULL THEN
    SELECT m.created_at INTO v_cutoff FROM public.world_live_messages m
     WHERE m.chatroom_id = NEW.chatroom_id
     ORDER BY m.created_at DESC OFFSET v_keep LIMIT 1;
    IF v_cutoff IS NOT NULL THEN
      DELETE FROM public.world_live_messages m
       WHERE m.chatroom_id = NEW.chatroom_id AND m.created_at <= v_cutoff;
    END IF;
  ELSE
    SELECT m.created_at INTO v_cutoff FROM public.world_live_messages m
     WHERE m.world_id = NEW.world_id AND m.channel_id IS NULL AND m.chatroom_id IS NULL
     ORDER BY m.created_at DESC OFFSET v_keep LIMIT 1;
    IF v_cutoff IS NOT NULL THEN
      DELETE FROM public.world_live_messages m
       WHERE m.world_id = NEW.world_id AND m.channel_id IS NULL AND m.chatroom_id IS NULL
         AND m.created_at <= v_cutoff;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_live_message_prune() FROM PUBLIC, anon, authenticated;
