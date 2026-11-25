-- ============================================================
-- Migration 259 — Les notifications ne s'écrivent plus depuis le client
-- ============================================================
-- FAILLE CORRIGÉE (préexistante, audit du 2026-11-25).
--
-- La policy `notifications_insert_public_merged` laissait tout compte insérer
-- une notification `mention` ou `world_invite` pour n'importe quel
-- destinataire, avec un nom d'expéditeur (`actor_name`), un contenu et des
-- métadonnées libres — notification push comprise. De quoi se faire passer
-- pour « Admin », annoncer une invitation inexistante ou harceler un compte.
--
-- Correctif : plus aucune insertion directe. Les deux usages légitimes passent
-- par la base, qui établit elle-même destinataires, expéditeur et contenu :
--   * `notify_user_mentions` pour les @pseudo d'un message (le texte peut être
--     chiffré : seul l'expéditeur sait qui il mentionne, la base vérifie le
--     reste) ;
--   * un trigger sur `world_invitations`, dont la policy d'insertion vérifie
--     déjà le droit d'inviter : l'invitation et sa notification ne font plus
--     qu'un, quelle que soit la voie (dialogue d'invitation ou courriel).

DROP POLICY IF EXISTS notifications_insert_public_merged ON public.notifications;


-- ── @pseudo ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_user_mentions(p_message_id bigint, p_usernames text[])
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
  v_visible  uuid[];
  v_title    text;
  v_private  boolean;
  v_actor    text;
  v_n        integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(p_usernames, 1), 0) = 0 THEN
    RETURN 0;
  END IF;
  IF array_length(p_usernames, 1) > 50 THEN
    RAISE EXCEPTION 'Trop de mentions.' USING ERRCODE = '22023';
  END IF;

  SELECT m.chat_id, m.world_id, m.author_id, m.visible_to
    INTO v_chat_id, v_world_id, v_author, v_visible
    FROM public.chat_messages m WHERE m.id = p_message_id;
  IF v_author IS NULL OR v_author <> v_uid THEN
    RAISE EXCEPTION 'Ce message n''est pas le vôtre.' USING ERRCODE = '42501';
  END IF;
  IF v_world_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT coalesce(c.title, c.name), c.visibility = 'private' INTO v_title, v_private
    FROM public.chatrooms c WHERE c.id = v_chat_id;
  SELECT p.username INTO v_actor FROM public.profiles p WHERE p.id = v_uid;

  -- Membres du monde seulement, jamais soi ; dans un salon privé ou un
  -- message murmuré, seulement ceux qui peuvent le lire.
  INSERT INTO public.notifications (recipient_id, type, world_id, chat_id, message_id, actor_id, actor_name, content)
  SELECT p.id, 'mention', v_world_id, v_chat_id, p_message_id, v_uid, v_actor, v_title
    FROM public.profiles p
    JOIN public.world_members wm ON wm.world_id = v_world_id AND wm.user_id = p.id
   WHERE p.username = ANY (p_usernames)
     AND p.id <> v_uid
     AND (v_visible IS NULL OR p.id = ANY (v_visible))
     AND (NOT coalesce(v_private, false) OR public.can_read_private_chatroom(v_chat_id, p.id))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_user_mentions(bigint, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_user_mentions(bigint, text[]) TO authenticated, service_role;


-- ── invitation à un monde ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_world_invitation_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_world record;
  v_actor text;
BEGIN
  SELECT w.name, w.icon_url, w.banner_url, w.description INTO v_world
    FROM public.worlds w WHERE w.id = NEW.world_id;
  SELECT p.username INTO v_actor FROM public.profiles p WHERE p.id = NEW.inviter_id;

  INSERT INTO public.notifications (recipient_id, type, world_id, actor_id, actor_name, content, metadata)
  VALUES (
    NEW.invitee_id, 'world_invite', NEW.world_id, NEW.inviter_id, v_actor, v_world.name,
    jsonb_build_object('icon_url', v_world.icon_url, 'banner_url', v_world.banner_url, 'description', v_world.description)
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_world_invitation_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_world_invitation_notify ON public.world_invitations;
CREATE TRIGGER trg_world_invitation_notify
  AFTER INSERT ON public.world_invitations
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_invitation_notify();

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP TRIGGER trg_world_invitation_notify ON public.world_invitations;
-- DROP FUNCTION public.tg_world_invitation_notify(), public.notify_user_mentions(bigint, text[]);
-- (la policy d'insertion d'origine figure dans la migration qui l'a créée)
