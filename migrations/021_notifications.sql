-- ============================================================
-- Migration 021 — Système de notifications centralisé
-- ============================================================

-- ── 1. notifications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         TEXT         NOT NULL CHECK (type IN ('mention', 'reaction', 'new_member', 'new_chatroom')),
  world_id     UUID         REFERENCES public.worlds(id)        ON DELETE CASCADE,
  chat_id      UUID         REFERENCES public.chatrooms(id)     ON DELETE SET NULL,
  message_id   BIGINT       REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  actor_id     UUID         REFERENCES auth.users(id)           ON DELETE SET NULL,
  actor_name   TEXT,
  content      TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created
  ON public.notifications (recipient_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: read own"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications: update own"
  ON public.notifications FOR UPDATE
  USING (recipient_id = auth.uid());

CREATE POLICY "notifications: delete own"
  ON public.notifications FOR DELETE
  USING (recipient_id = auth.uid());

-- Permet au client d'insérer des notifications de mention pour d'autres utilisateurs
CREATE POLICY "notifications: insert mention"
  ON public.notifications FOR INSERT
  WITH CHECK (
    type = 'mention'
    AND actor_id = auth.uid()
    AND recipient_id != auth.uid()
  );


-- ── 2. notification_preferences ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id  UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type     TEXT  NOT NULL CHECK (type IN ('mention', 'reaction', 'new_member', 'new_chatroom')),
  enabled  BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_preferences: all own"
  ON public.notification_preferences FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── 3. Trigger : réaction sur un message ─────────────────────
-- Notifie l'auteur d'un message quand quelqu'un y réagit
CREATE OR REPLACE FUNCTION public.notify_on_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_author_id UUID;
  v_world_id  UUID;
  v_actor_name TEXT;
  v_enabled   BOOLEAN;
BEGIN
  SELECT author_id, world_id
  INTO v_author_id, v_world_id
  FROM public.chat_messages
  WHERE id = NEW.message_id;

  -- Pas de notification si le message n'a pas d'auteur ou si c'est sa propre réaction
  IF v_author_id IS NULL OR v_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT enabled INTO v_enabled
  FROM public.notification_preferences
  WHERE user_id = v_author_id AND type = 'reaction';
  IF v_enabled = false THEN RETURN NEW; END IF;

  SELECT username INTO v_actor_name FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications
    (recipient_id, type, world_id, chat_id, message_id, actor_id, actor_name, content)
  VALUES
    (v_author_id, 'reaction', v_world_id, NEW.chat_id, NEW.message_id,
     NEW.user_id, v_actor_name, NEW.emoji);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_reaction_notify ON public.chat_message_reactions;
CREATE TRIGGER on_reaction_notify
  AFTER INSERT ON public.chat_message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_reaction();


-- ── 4. Trigger : nouveau membre dans un monde ─────────────────
-- Notifie le propriétaire du monde quand un nouveau membre le rejoint
CREATE OR REPLACE FUNCTION public.notify_on_new_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner_id   UUID;
  v_world_name TEXT;
  v_actor_name TEXT;
  v_enabled    BOOLEAN;
BEGIN
  SELECT owner_id, name INTO v_owner_id, v_world_name
  FROM public.worlds WHERE id = NEW.world_id;

  -- Pas de notification si le propriétaire rejoint son propre monde
  IF v_owner_id IS NULL OR v_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT enabled INTO v_enabled
  FROM public.notification_preferences
  WHERE user_id = v_owner_id AND type = 'new_member';
  IF v_enabled = false THEN RETURN NEW; END IF;

  SELECT username INTO v_actor_name FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications
    (recipient_id, type, world_id, actor_id, actor_name, content)
  VALUES
    (v_owner_id, 'new_member', NEW.world_id, NEW.user_id, v_actor_name, v_world_name);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_member_notify ON public.world_members;
CREATE TRIGGER on_member_notify
  AFTER INSERT ON public.world_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_member();


-- ── 5. Trigger : nouvelle chatroom dans un monde ──────────────
-- Notifie tous les membres du monde (sauf le créateur) quand une chatroom est créée
CREATE OR REPLACE FUNCTION public.notify_on_new_chatroom()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member     RECORD;
  v_actor_name TEXT;
  v_enabled    BOOLEAN;
BEGIN
  IF NEW.world_id IS NULL THEN RETURN NEW; END IF;

  SELECT username INTO v_actor_name FROM public.profiles WHERE id = NEW.created_by;

  FOR v_member IN
    SELECT user_id FROM public.world_members
    WHERE world_id = NEW.world_id
      AND user_id IS DISTINCT FROM NEW.created_by
  LOOP
    SELECT enabled INTO v_enabled
    FROM public.notification_preferences
    WHERE user_id = v_member.user_id AND type = 'new_chatroom';

    IF v_enabled IS DISTINCT FROM false THEN
      INSERT INTO public.notifications
        (recipient_id, type, world_id, chat_id, actor_id, actor_name, content)
      VALUES
        (v_member.user_id, 'new_chatroom', NEW.world_id, NEW.id,
         NEW.created_by, v_actor_name, COALESCE(NEW.title, NEW.name));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_chatroom_notify ON public.chatrooms;
CREATE TRIGGER on_chatroom_notify
  AFTER INSERT ON public.chatrooms
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_new_chatroom();
