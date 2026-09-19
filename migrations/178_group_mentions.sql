-- ============================================================
-- Migration 178 — Mentions de rôle, @tous et @ici
-- ============================================================
-- Une mention `@pseudo` alerte une personne ; il manquait le moyen d'appeler
-- un groupe : les porteurs d'un rôle (`@Maître du jeu`), tout le monde
-- (`@tous`) ou les présents (`@ici`). Le texte du message reste du texte —
-- il peut être chiffré, seul le client sait ce qu'il envoie — et c'est le
-- client qui, après l'envoi, demande ici les notifications.
--
-- ── 1. Deux types de notification ────────────────────────────
-- `role_mention` (metadata : role_id, role_name, role_color) et
-- `everyone_mention` (metadata.scope : 'everyone' | 'here'), chacun avec sa
-- préférence — on peut couper les @tous sans perdre les mentions de son rôle.
--
-- ── 2. Une notification par (membre, message) ────────────────
-- La déduplication du déclencheur, jusqu'ici propre à `mention`, couvre les
-- trois types ensemble : mentionné par son pseudo ET par son rôle, on n'est
-- prévenu qu'une fois. L'index unique partiel suit.
--
-- ── 3. La RPC ────────────────────────────────────────────────
-- `notify_group_mentions(p_message_id, p_role_ids, p_everyone, p_here_ids)`,
-- SECURITY DEFINER : elle vérifie que l'appelant est l'auteur du message,
-- puis, rôle par rôle, qu'il est mentionnable ou que l'appelant a
-- `mentions.roles` ; `@tous` et `@ici` exigent `mentions.everyone`. Les
-- présents (`p_here_ids`) viennent du canal de présence côté client : la RPC
-- les croise avec les membres du monde. 500 destinataires au plus par groupe.
-- La politique d'insertion client sur `notifications` ne change pas : ces
-- deux types ne s'écrivent que par ici.

-- ── 1. Les types ─────────────────────────────────────────────

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite',
    'chatroom_reply', 'persona_new_chatroom', 'persona_reply', 'relation_request',
    'role_mention', 'everyone_mention'
  ));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_type_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'chatroom_reply',
    'persona_new_chatroom', 'persona_reply', 'relation_request',
    'role_mention', 'everyone_mention'
  ));

-- ── 2. La déduplication ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_notification_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  -- 1. La préférence du destinataire pour ce type.
  SELECT enabled INTO v_enabled
  FROM public.notification_preferences
  WHERE user_id = NEW.recipient_id AND type = NEW.type;

  IF v_enabled = false THEN
    RETURN NULL; -- annule l'INSERT
  END IF;

  -- 2. Une seule alerte par (membre, message), quelle que soit la façon dont
  --    il a été mentionné : pseudo, rôle, @tous ou @ici.
  IF NEW.type IN ('mention', 'role_mention', 'everyone_mention') AND NEW.message_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE type IN ('mention', 'role_mention', 'everyone_mention')
        AND recipient_id = NEW.recipient_id
        AND message_id = NEW.message_id
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP INDEX IF EXISTS public.notifications_mention_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_message_mention_dedup
  ON public.notifications (recipient_id, message_id)
  WHERE type IN ('mention', 'role_mention', 'everyone_mention') AND message_id IS NOT NULL;

-- ── 3. La RPC ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_group_mentions(
  p_message_id bigint,
  p_role_ids uuid[] DEFAULT '{}',
  p_everyone boolean DEFAULT false,
  p_here_ids uuid[] DEFAULT '{}'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_chat_id  uuid;
  v_world_id uuid;
  v_author   uuid;
  v_title    text;
  v_actor    text;
  v_role     record;
  v_n        integer;
  v_total    integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.';
  END IF;

  SELECT m.chat_id, m.world_id, m.author_id INTO v_chat_id, v_world_id, v_author
    FROM public.chat_messages m WHERE m.id = p_message_id;
  IF v_author IS NULL OR v_author <> v_uid THEN
    RAISE EXCEPTION 'Ce message n''est pas le vôtre.';
  END IF;
  IF v_world_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT coalesce(c.title, c.name) INTO v_title FROM public.chatrooms c WHERE c.id = v_chat_id;
  SELECT p.username INTO v_actor FROM public.profiles p WHERE p.id = v_uid;

  -- Les rôles : mentionnables par tous, ou par qui a `mentions.roles`.
  FOR v_role IN
    SELECT r.id, r.name, r.color, r.mentionable
      FROM public.world_roles r
     WHERE r.world_id = v_world_id AND r.id = ANY (coalesce(p_role_ids, '{}'::uuid[]))
  LOOP
    IF NOT v_role.mentionable AND NOT public.has_world_permission(v_world_id, v_uid, 'mentions.roles') THEN
      CONTINUE;
    END IF;
    INSERT INTO public.notifications (recipient_id, type, world_id, chat_id, message_id, actor_id, actor_name, content, metadata)
    SELECT mr.user_id, 'role_mention', v_world_id, v_chat_id, p_message_id, v_uid, v_actor, v_title,
           jsonb_build_object('role_id', v_role.id, 'role_name', v_role.name, 'role_color', v_role.color)
      FROM public.world_member_roles mr
     WHERE mr.role_id = v_role.id AND mr.user_id <> v_uid
     LIMIT 500
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;

  -- Tout le monde, ou les présents.
  IF (p_everyone OR coalesce(array_length(p_here_ids, 1), 0) > 0)
     AND public.has_world_permission(v_world_id, v_uid, 'mentions.everyone') THEN
    INSERT INTO public.notifications (recipient_id, type, world_id, chat_id, message_id, actor_id, actor_name, content, metadata)
    SELECT wm.user_id, 'everyone_mention', v_world_id, v_chat_id, p_message_id, v_uid, v_actor, v_title,
           jsonb_build_object('scope', CASE WHEN p_everyone THEN 'everyone' ELSE 'here' END)
      FROM public.world_members wm
     WHERE wm.world_id = v_world_id
       AND wm.user_id <> v_uid
       AND (p_everyone OR wm.user_id = ANY (p_here_ids))
     LIMIT 500
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END IF;

  RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_group_mentions(bigint, uuid[], boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_group_mentions(bigint, uuid[], boolean, uuid[]) TO authenticated;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT indexname FROM pg_indexes WHERE tablename='notifications' AND indexname LIKE '%mention%'; -- → notifications_message_mention_dedup
-- En tant qu'auteur d'un message : SELECT public.notify_group_mentions(<id>, ARRAY['<role>']::uuid[], false, '{}');
--   → le nombre de porteurs du rôle (moins soi), 0 au second appel.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP FUNCTION public.notify_group_mentions(bigint, uuid[], boolean, uuid[]);
-- Rejouer `enforce_notification_preference` et l'index de la migration 035 ;
-- les contraintes de type de la 175, après suppression des notifications et
-- préférences des deux nouveaux types.
