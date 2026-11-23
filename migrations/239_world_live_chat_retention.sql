-- 239 — Chatbox : nombre de messages conservés, réglable par monde.
--
-- Le délestage existe depuis la migration 202 : après chaque message, seuls
-- les N plus récents de la salle restent (la salle principale, chaque salle
-- personnalisée et chaque fil de salon comptent à part, migration 238).
-- N valait 500 en dur ; il devient `worlds.live_chat_retention`, réglé dans
-- Paramètres › Fonctions › Chatbox.
--
-- 1. La colonne : 500 par défaut (rien ne change pour les mondes existants),
--    bornée de 50 à 1000. Les paliers proposés sont dans
--    lib/worldLiveChatRetention.ts.
-- 2. Le délestage à l'envoi lit le réglage du monde.
-- 3. Baisser le réglage déleste tout de suite chaque salle du monde, sans
--    attendre le prochain message.

-- ── 1. Le réglage ────────────────────────────────────────────
ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS live_chat_retention integer NOT NULL DEFAULT 500;
ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_live_chat_retention_range;
ALTER TABLE public.worlds
  ADD CONSTRAINT worlds_live_chat_retention_range CHECK (live_chat_retention BETWEEN 50 AND 1000);

-- ── 2. Délestage à l'envoi ───────────────────────────────────
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
  v_keep := coalesce(v_keep, 500);

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

-- ── 3. Délestage immédiat quand le réglage baisse ────────────
-- Une salle = un couple (channel_id, chatroom_id) : PARTITION BY range les
-- nuls ensemble, la salle principale forme donc une seule partition.
CREATE OR REPLACE FUNCTION public.tg_world_live_retention_shrink()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.world_live_messages m
   USING (
     SELECT r.id,
            row_number() OVER (
              PARTITION BY r.channel_id, r.chatroom_id
              ORDER BY r.created_at DESC, r.id DESC
            ) AS rang
       FROM public.world_live_messages r
      WHERE r.world_id = NEW.id
   ) k
   WHERE m.id = k.id AND k.rang > NEW.live_chat_retention;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_live_retention_shrink() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_world_live_retention_shrink ON public.worlds;
CREATE TRIGGER trg_world_live_retention_shrink
  AFTER UPDATE OF live_chat_retention ON public.worlds
  FOR EACH ROW
  WHEN (NEW.live_chat_retention < OLD.live_chat_retention)
  EXECUTE FUNCTION public.tg_world_live_retention_shrink();
