-- ============================================================
-- Migration 036 — Notification "réponse dans une chatroom"
-- ============================================================
-- Une seule notification par (recipient, chatroom) active :
-- le compteur s'incrémente et la date se rafraîchit à chaque nouveau message.

-- ── 1. Ajout de chatroom_reply aux contraintes de type ────────────────────────

ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite', 'chatroom_reply'));

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT notification_preferences_type_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_type_check
  CHECK (type IN ('mention', 'reaction', 'new_member', 'new_chatroom', 'chatroom_reply'));

-- ── 2. Colonne updated_at pour trier par activité récente ────────────────────

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE public.notifications SET updated_at = created_at WHERE updated_at IS NULL;

-- ── 3. Index unique partiel — une seule notif active par (recipient, chatroom) ─

CREATE UNIQUE INDEX IF NOT EXISTS notifications_chatroom_reply_active
  ON public.notifications (recipient_id, chat_id)
  WHERE type = 'chatroom_reply' AND archived_at IS NULL;

-- ── 4. Trigger : nouveau message → upsert notification agrégée ───────────────

CREATE OR REPLACE FUNCTION public.notify_on_chatroom_reply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_participant   RECORD;
  v_world_id      UUID;
  v_actor_name    TEXT;
  v_chatroom_name TEXT;
  v_enabled       BOOLEAN;
BEGIN
  IF NEW.author_id IS NULL THEN RETURN NEW; END IF;

  SELECT world_id, COALESCE(title, name)
  INTO v_world_id, v_chatroom_name
  FROM public.chatrooms WHERE id = NEW.chat_id;

  -- Chatrooms hors-monde non concernées
  IF v_world_id IS NULL THEN RETURN NEW; END IF;

  SELECT username INTO v_actor_name FROM public.profiles WHERE id = NEW.author_id;

  -- Pour chaque participant distinct dans la chatroom (sauf l'auteur)
  FOR v_participant IN
    SELECT DISTINCT author_id AS user_id
    FROM public.chat_messages
    WHERE chat_id = NEW.chat_id
      AND author_id IS DISTINCT FROM NEW.author_id
      AND author_id IS NOT NULL
    LIMIT 200
  LOOP
    -- Vérifier la préférence de notification
    SELECT enabled INTO v_enabled
    FROM public.notification_preferences
    WHERE user_id = v_participant.user_id AND type = 'chatroom_reply';
    IF v_enabled = false THEN CONTINUE; END IF;

    -- Upsert : incrémenter le compteur si une notification active existe déjà
    INSERT INTO public.notifications
      (recipient_id, type, world_id, chat_id, actor_id, actor_name, content, metadata, updated_at)
    VALUES
      (v_participant.user_id, 'chatroom_reply', v_world_id, NEW.chat_id,
       NEW.author_id, v_actor_name, v_chatroom_name,
       '{"count": 1}'::jsonb, now())
    ON CONFLICT (recipient_id, chat_id)
    WHERE type = 'chatroom_reply' AND archived_at IS NULL
    DO UPDATE SET
      metadata   = jsonb_set(
                     COALESCE(notifications.metadata, '{}'),
                     '{count}',
                     to_jsonb(COALESCE((notifications.metadata->>'count')::int, 0) + 1)
                   ),
      actor_id   = NEW.author_id,
      actor_name = v_actor_name,
      updated_at = now(),
      read_at    = NULL;

  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_chatroom_reply_notify ON public.chat_messages;
CREATE TRIGGER on_chatroom_reply_notify
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_chatroom_reply();
