-- ============================================================
-- Migration 074 — Fusion persona_reply / chatroom_reply
-- ============================================================
-- Un follower d'un persona qui a déjà posté dans le salon reçoit une
-- notification double sur une réponse : "chatroom_reply" (participant) ET
-- "persona_reply" (abonné du persona), pour le même message.
--
-- Correctif : notify_on_chatroom_reply() porte désormais l'identité du
-- persona (persona_id + metadata.persona_name/icon_url, "dernier auteur
-- gagne" comme actor_id/actor_name) ; notify_on_persona_activity() saute la
-- notification persona_reply pour tout follower déjà participant du salon
-- (il recevra la chatroom_reply enrichie à la place). Le cas
-- persona_new_chatroom n'a pas cette collision : au tout premier message
-- d'un salon, il ne peut par définition exister aucun autre participant.
--
-- NB : les définitions "avant" ci-dessous reflètent l'état réel en base
-- (vérifié via pg_get_functiondef), qui diffère légèrement des migrations
-- locales 036/072 — voir la note dans project_wvlds_refactor sur la
-- désynchronisation du dossier migrations/ avec l'historique réel.

CREATE OR REPLACE FUNCTION public.notify_on_chatroom_reply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  v_participant    RECORD;
  v_world_id       UUID;
  v_actor_name     TEXT;
  v_chatroom_name  TEXT;
  v_enabled        BOOLEAN;
  v_persona_name   TEXT;
  v_persona_avatar TEXT;
  v_persona_meta   JSONB;
BEGIN
  IF NEW.author_id IS NULL THEN RETURN NEW; END IF;

  SELECT world_id, COALESCE(title, name)
  INTO v_world_id, v_chatroom_name
  FROM public.chatrooms WHERE id = NEW.chat_id;

  IF v_world_id IS NULL THEN RETURN NEW; END IF;

  SELECT username INTO v_actor_name FROM public.profiles WHERE id = NEW.author_id;

  IF NEW.persona_id IS NOT NULL THEN
    SELECT name, avatar_url INTO v_persona_name, v_persona_avatar
    FROM public.personas WHERE id = NEW.persona_id;
    v_persona_meta := jsonb_build_object('persona_name', v_persona_name, 'icon_url', v_persona_avatar);
  ELSE
    v_persona_meta := '{}'::jsonb;
  END IF;

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

    INSERT INTO public.notifications
      (recipient_id, type, world_id, chat_id, actor_id, actor_name, persona_id, content, metadata, updated_at)
    VALUES
      (v_participant.user_id, 'chatroom_reply', v_world_id, NEW.chat_id,
       NEW.author_id, v_actor_name, NEW.persona_id, v_chatroom_name,
       ('{"count": 1}'::jsonb || v_persona_meta), now())
    ON CONFLICT (recipient_id, chat_id)
    WHERE type = 'chatroom_reply' AND archived_at IS NULL AND read_at IS NULL
    DO UPDATE SET
      metadata   = (jsonb_set(
                     COALESCE(notifications.metadata, '{}'),
                     '{count}',
                     to_jsonb(COALESCE((notifications.metadata->>'count')::int, 0) + 1)
                   ) - 'persona_name' - 'icon_url') || v_persona_meta,
      actor_id   = NEW.author_id,
      actor_name = v_actor_name,
      persona_id = NEW.persona_id,
      updated_at = now();

  END LOOP;

  RETURN NEW;
END;
$$;

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
      -- Si ce follower a déjà posté dans ce salon, notify_on_chatroom_reply
      -- lui enverra (ou a déjà envoyé) une notification chatroom_reply
      -- enrichie de l'identité du persona : pas la peine de dupliquer.
      IF EXISTS (
        SELECT 1 FROM public.chat_messages
        WHERE chat_id = NEW.chat_id
          AND author_id = v_follower.follower_id
          AND id <> NEW.id
      ) THEN
        CONTINUE;
      END IF;

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
