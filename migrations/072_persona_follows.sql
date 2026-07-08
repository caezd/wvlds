-- ============================================================
-- Migration 072 — Suivre un persona + notifications d'activité
-- ============================================================
-- Permet de suivre un persona depuis sa fiche et d'être notifié quand il
-- crée une nouvelle chatroom (son premier message dans ce salon) ou y
-- répond, dans un monde.

-- ── 1. persona_follows ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.persona_follows (
  follower_id UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  persona_id  UUID        NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, persona_id)
);

CREATE INDEX IF NOT EXISTS idx_persona_follows_persona
  ON public.persona_follows (persona_id);

ALTER TABLE public.persona_follows ENABLE ROW LEVEL SECURITY;

-- Lecture/insertion limitées aux personas visibles (propriétaire ou membre
-- du monde du persona) — même règle que "personas_readable_by_world_members",
-- via le helper public.is_world_member() déjà utilisé ailleurs dans le schéma.
CREATE POLICY "persona_follows: read if persona visible"
  ON public.persona_follows FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.personas p
      WHERE p.id = persona_follows.persona_id
        AND (
          p.user_id = (SELECT auth.uid())
          OR public.is_world_member(p.world_id, (SELECT auth.uid()))
        )
    )
  );

CREATE POLICY "persona_follows: insert own"
  ON public.persona_follows FOR INSERT
  WITH CHECK (
    follower_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.personas p
      WHERE p.id = persona_follows.persona_id
        AND (
          p.user_id = (SELECT auth.uid())
          OR public.is_world_member(p.world_id, (SELECT auth.uid()))
        )
    )
  );

CREATE POLICY "persona_follows: delete own"
  ON public.persona_follows FOR DELETE
  USING (follower_id = (SELECT auth.uid()));


-- ── 2. notifications : nouveaux types + colonne persona_id ───

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS persona_id UUID REFERENCES public.personas(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite',
    'chatroom_reply', 'persona_new_chatroom', 'persona_reply'
  ));

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT notification_preferences_type_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'chatroom_reply',
    'persona_new_chatroom', 'persona_reply'
  ));

-- Une seule notification "persona_reply" active par (destinataire, persona, salon) :
-- le compteur s'incrémente au lieu de spammer une ligne par message.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_persona_reply_active
  ON public.notifications (recipient_id, persona_id, chat_id)
  WHERE type = 'persona_reply' AND archived_at IS NULL;


-- ── 3. Trigger : activité d'un persona suivi ──────────────────
-- Sur chaque message posté avec un persona dans une chatroom de monde :
-- si c'est le tout premier message du salon, le persona "vient de le créer" ;
-- sinon il y "répond". Notifie chaque abonné du persona (sauf l'auteur).

CREATE OR REPLACE FUNCTION public.notify_on_persona_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  v_follower       RECORD;
  v_chatroom_name  TEXT;
  v_persona_name   TEXT;
  v_persona_avatar TEXT;
  v_is_first       BOOLEAN;
  v_notif_type     TEXT;
  v_enabled        BOOLEAN;
BEGIN
  IF NEW.persona_id IS NULL OR NEW.world_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(title, name) INTO v_chatroom_name
  FROM public.chatrooms WHERE id = NEW.chat_id;

  SELECT name, avatar_url INTO v_persona_name, v_persona_avatar
  FROM public.personas WHERE id = NEW.persona_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.chat_messages
    WHERE chat_id = NEW.chat_id AND id <> NEW.id
  ) INTO v_is_first;

  v_notif_type := CASE WHEN v_is_first THEN 'persona_new_chatroom' ELSE 'persona_reply' END;

  FOR v_follower IN
    SELECT follower_id FROM public.persona_follows
    WHERE persona_id = NEW.persona_id
      AND follower_id IS DISTINCT FROM NEW.author_id
  LOOP
    SELECT enabled INTO v_enabled
    FROM public.notification_preferences
    WHERE user_id = v_follower.follower_id AND type = v_notif_type;
    IF v_enabled = false THEN CONTINUE; END IF;

    IF v_is_first THEN
      INSERT INTO public.notifications
        (recipient_id, type, world_id, chat_id, actor_id, actor_name, persona_id, content, metadata)
      VALUES
        (v_follower.follower_id, v_notif_type, NEW.world_id, NEW.chat_id,
         NEW.author_id, v_persona_name, NEW.persona_id, v_chatroom_name,
         jsonb_build_object('icon_url', v_persona_avatar));
    ELSE
      INSERT INTO public.notifications
        (recipient_id, type, world_id, chat_id, actor_id, actor_name, persona_id, content, metadata, updated_at)
      VALUES
        (v_follower.follower_id, v_notif_type, NEW.world_id, NEW.chat_id,
         NEW.author_id, v_persona_name, NEW.persona_id, v_chatroom_name,
         jsonb_build_object('icon_url', v_persona_avatar, 'count', 1), now())
      ON CONFLICT (recipient_id, persona_id, chat_id)
      WHERE type = 'persona_reply' AND archived_at IS NULL
      DO UPDATE SET
        metadata   = jsonb_set(
                       COALESCE(notifications.metadata, '{}'),
                       '{count}',
                       to_jsonb(COALESCE((notifications.metadata->>'count')::int, 0) + 1)
                     ) || jsonb_build_object('icon_url', v_persona_avatar),
        actor_id   = NEW.author_id,
        actor_name = v_persona_name,
        updated_at = now(),
        read_at    = NULL;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_persona_activity_notify ON public.chat_messages;
CREATE TRIGGER on_persona_activity_notify
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_persona_activity();
