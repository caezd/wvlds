-- ============================================================
-- Migration 037 — chatroom_reply : reset après lecture
-- ============================================================
-- Une notification lue est considérée comme désuète.
-- Le prochain message crée une nouvelle notification (count=1)
-- plutôt que d'incrémenter celle déjà lue.
-- Le UPSERT ne cible plus que les notifications NON lues
-- (AND read_at IS NULL dans l'index et dans ON CONFLICT).

-- ── 1. Remplacer l'index unique partiel ──────────────────────────────────────

DROP INDEX IF EXISTS public.notifications_chatroom_reply_active;

CREATE UNIQUE INDEX notifications_chatroom_reply_active
  ON public.notifications (recipient_id, chat_id)
  WHERE type = 'chatroom_reply' AND archived_at IS NULL AND read_at IS NULL;

-- ── 2. Mettre à jour la fonction trigger ─────────────────────────────────────

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

  IF v_world_id IS NULL THEN RETURN NEW; END IF;

  SELECT username INTO v_actor_name FROM public.profiles WHERE id = NEW.author_id;

  FOR v_participant IN
    SELECT DISTINCT author_id AS user_id
    FROM public.chat_messages
    WHERE chat_id = NEW.chat_id
      AND author_id IS DISTINCT FROM NEW.author_id
      AND author_id IS NOT NULL
    LIMIT 200
  LOOP
    SELECT enabled INTO v_enabled
    FROM public.notification_preferences
    WHERE user_id = v_participant.user_id AND type = 'chatroom_reply';
    IF v_enabled = false THEN CONTINUE; END IF;

    -- Upsert uniquement sur la notification NON lue.
    -- Si la notification existante est lue (read_at IS NOT NULL),
    -- l'index ne matche plus → INSERT crée une nouvelle notification fraîche.
    INSERT INTO public.notifications
      (recipient_id, type, world_id, chat_id, actor_id, actor_name, content, metadata, updated_at)
    VALUES
      (v_participant.user_id, 'chatroom_reply', v_world_id, NEW.chat_id,
       NEW.author_id, v_actor_name, v_chatroom_name,
       '{"count": 1}'::jsonb, now())
    ON CONFLICT (recipient_id, chat_id)
    WHERE type = 'chatroom_reply' AND archived_at IS NULL AND read_at IS NULL
    DO UPDATE SET
      metadata   = jsonb_set(
                     COALESCE(notifications.metadata, '{}'),
                     '{count}',
                     to_jsonb(COALESCE((notifications.metadata->>'count')::int, 0) + 1)
                   ),
      actor_id   = NEW.author_id,
      actor_name = v_actor_name,
      updated_at = now();
      -- read_at n'est plus remis à NULL : si la notif est lue, elle reste lue
      -- et un futur message créera une nouvelle notification (voir index ci-dessus)

  END LOOP;

  RETURN NEW;
END;
$$;
