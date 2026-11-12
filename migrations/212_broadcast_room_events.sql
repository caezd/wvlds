-- 212 — Temps réel d'un salon : diffusion depuis la base (broadcast).
--
-- Chaque salon ouvert s'abonnait à sept flux `postgres_changes` (messages,
-- salon, réactions, votes, ordre de passage, et TOUTES les mises à jour de
-- `personas`, sans filtre). Pour chaque changement, Realtime évaluait les
-- policies pour chaque abonné. Désormais des triggers diffusent des avis
-- minimaux sur un canal PRIVÉ par salon, `room:<chat_id>`, dont l'accès est
-- vérifié une fois, à l'abonnement (membre du monde du salon — la même règle
-- que la lecture des messages).
--
-- Les avis ne portent que des ids ; le client relit le message (contenu,
-- persona) sous la policy de lecture. Une note privée (`visible_to`) n'est
-- PAS annoncée sur le canal du salon — les autres n'apprennent même pas
-- qu'elle existe : son avis part sur le canal personnel `msgs:<user>` de
-- chacun de ses destinataires (événement `room_message`), relayé au salon par
-- le client.
--
-- Événements du canal `room:<chat_id>` :
--   message  { op: INSERT|UPDATE|DELETE, id, author_id }
--   chatroom { title, name, banner_url, icon_url }
--   reaction { op: INSERT|DELETE, message_id, emoji, user_id }
--   vote     { op: INSERT|UPDATE|DELETE, message_id, user_id, old_option_id, new_option_id }
--   turn     { chat_id, enabled, order_user_ids, current_index }
--   persona  { id, avatar_url }  (aux salons où la persona a écrit)
--
-- Déploiement : appliquer AVANT le client qui écoute ces canaux. L'ancien
-- client (postgres_changes) n'en est pas affecté.

-- ── Accès aux canaux privés ───────────────────────────────────────
-- Réécrit la policy de la migration 206 en y ajoutant les canaux de salon.
DROP POLICY IF EXISTS "wvlds_message_topics_read" ON realtime.messages;
CREATE POLICY "wvlds_message_topics_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (
      (
        (SELECT realtime.topic()) ~ '^world-msgs:[0-9a-f-]{36}$'
        AND public.is_world_member(substr((SELECT realtime.topic()), 12)::uuid, (SELECT auth.uid()))
      )
      OR (SELECT realtime.topic()) = 'msgs:' || (SELECT auth.uid())::text
      OR (
        (SELECT realtime.topic()) ~ '^room:[0-9a-f-]{36}$'
        AND EXISTS (
          SELECT 1 FROM public.chatrooms c
          WHERE c.id = substr((SELECT realtime.topic()), 6)::uuid
            AND public.is_world_member(c.world_id, (SELECT auth.uid()))
        )
      )
    )
  );

-- ── Messages ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_room_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.chat_messages%ROWTYPE;
  destinataire uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF r.visible_to IS NULL THEN
    PERFORM realtime.send(
      jsonb_build_object('op', TG_OP, 'id', r.id, 'author_id', r.author_id),
      'message', 'room:' || r.chat_id::text, true);
  ELSE
    FOREACH destinataire IN ARRAY r.visible_to LOOP
      PERFORM realtime.send(
        jsonb_build_object('op', TG_OP, 'id', r.id, 'chat_id', r.chat_id, 'author_id', r.author_id),
        'room_message', 'msgs:' || destinataire::text, true);
    END LOOP;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_message : %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_room_message ON public.chat_messages;
CREATE TRIGGER trg_broadcast_room_message
  AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_room_message();

-- ── Salon (titre, bannière, icône) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_room_patch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.title, NEW.name, NEW.banner_url, NEW.icon_url)
     IS DISTINCT FROM (OLD.title, OLD.name, OLD.banner_url, OLD.icon_url) THEN
    PERFORM realtime.send(
      jsonb_build_object('title', NEW.title, 'name', NEW.name, 'banner_url', NEW.banner_url, 'icon_url', NEW.icon_url),
      'chatroom', 'room:' || NEW.id::text, true);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_patch : %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_room_patch ON public.chatrooms;
CREATE TRIGGER trg_broadcast_room_patch
  AFTER UPDATE ON public.chatrooms
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_room_patch();

-- ── Réactions ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_room_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.chat_message_reactions%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  PERFORM realtime.send(
    jsonb_build_object('op', TG_OP, 'message_id', r.message_id, 'emoji', r.emoji, 'user_id', r.user_id),
    'reaction', 'room:' || r.chat_id::text, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_reaction : %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_room_reaction ON public.chat_message_reactions;
CREATE TRIGGER trg_broadcast_room_reaction
  AFTER INSERT OR DELETE ON public.chat_message_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_room_reaction();

-- ── Votes ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_room_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  chat uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN chat := OLD.chat_id; ELSE chat := NEW.chat_id; END IF;
  PERFORM realtime.send(
    jsonb_build_object(
      'op', TG_OP,
      'message_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.message_id ELSE NEW.message_id END,
      'user_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END,
      'old_option_id', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.option_id END,
      'new_option_id', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.option_id END),
    'vote', 'room:' || chat::text, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_vote : %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_room_vote ON public.chat_choice_votes;
CREATE TRIGGER trg_broadcast_room_vote
  AFTER INSERT OR UPDATE OR DELETE ON public.chat_choice_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_room_vote();

-- ── Ordre de passage ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_room_turn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('chat_id', NEW.chat_id, 'enabled', NEW.enabled,
                       'order_user_ids', NEW.order_user_ids, 'current_index', NEW.current_index),
    'turn', 'room:' || NEW.chat_id::text, true);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_turn : %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_room_turn ON public.chatroom_turns;
CREATE TRIGGER trg_broadcast_room_turn
  AFTER INSERT OR UPDATE ON public.chatroom_turns
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_room_turn();

-- ── Avatar d'une persona, aux salons où elle a écrit ─────────────
CREATE OR REPLACE FUNCTION public.broadcast_room_persona()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  salon uuid;
BEGIN
  IF NEW.avatar_url IS NOT DISTINCT FROM OLD.avatar_url THEN
    RETURN NULL;
  END IF;
  FOR salon IN SELECT a.chat_id FROM public.chatroom_persona_authors a WHERE a.persona_id = NEW.id LOOP
    PERFORM realtime.send(
      jsonb_build_object('id', NEW.id, 'avatar_url', NEW.avatar_url),
      'persona', 'room:' || salon::text, true);
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_persona : %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_room_persona ON public.personas;
CREATE TRIGGER trg_broadcast_room_persona
  AFTER UPDATE OF avatar_url ON public.personas
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_room_persona();

REVOKE EXECUTE ON FUNCTION public.broadcast_room_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_room_patch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_room_reaction() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_room_vote() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_room_turn() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_room_persona() FROM PUBLIC, anon, authenticated;

-- ── RETOUR ARRIÈRE ───────────────────────────────────────────
-- Supprimer les six triggers trg_broadcast_room_* et leurs fonctions, puis
-- rejouer la policy de la migration 206 (sans les canaux room:).
