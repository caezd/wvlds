-- 214 — Temps réel : les derniers flux `postgres_changes` passent en diffusion.
--
-- Il restait une quinzaine d'abonnements `postgres_changes` (messages privés,
-- notifications, liste des salons, chat en direct, épingles, carte, wiki,
-- widgets d'accueil). Tant qu'il en reste UN, Realtime relit le journal de la
-- base en boucle (97 % du temps de calcul de la base mesuré) et vérifie chaque
-- changement abonné par abonné. Ici, des triggers diffusent des avis sur des
-- canaux PRIVÉS, dont l'accès est vérifié une fois, à l'abonnement. Le client
-- (lib/realtimeHub) partage un canal par sujet entre tous les écrans.
--
-- Contenu des avis : la ligne entière quand elle est lisible par exactement
-- les mêmes personnes que le canal (membres du monde pour `world:`, les deux
-- interlocuteurs pour un message privé sur `msgs:`), sinon des ids seuls, que
-- le client relit sous les policies.
--
-- Canal `world:<world_id>` (nouveau ; membres du monde) :
--   chatroom  { op, id, … colonnes affichées }   (pas pour `updated_at` seul)
--   category  { op, id }
--   summary   { op, chat_id, last_message_at, last_message_author_id, last_message_persona_avatar_url }
--   live      { op, record } | { op, id }       (chat en direct)
--   map       { table, op, record } | { table, op, id }
--   persona   { op, id }
--   member    { op, user_id }
--   lexicon   { op, id }
--   wiki_page { op, id }   (seulement une page visible de tous les membres, avant ou après)
-- Canal `wiki:<page_id>` (nouveau ; qui peut lire la page — brouillons et
-- pages restreintes compris, sous la policy de la page) :
--   note, note_category, annotation  { op, id }
-- Canal `room:<chat_id>` (migration 212) :
--   pin { op, record } | { op, id }
-- Canal `msgs:<user_id>` (migration 206) :
--   dm           { op, record } | { op, id, conversation_id }   (aux deux interlocuteurs)
--   notification { op, id, chat_id, archived }
--
-- Déploiement : appliquer AVANT le client qui écoute ces canaux. L'ancien
-- client (postgres_changes) n'en est pas affecté.

-- ── Accès aux canaux privés ───────────────────────────────────────
-- Réécrit la policy des migrations 206/212 en y ajoutant `world:` et `wiki:`.
-- Pour `wiki:`, la lecture de la page passe par SA policy (brouillons,
-- restrictions) : le canal suit exactement qui peut lire la page.
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
      OR (
        (SELECT realtime.topic()) ~ '^world:[0-9a-f-]{36}$'
        AND public.is_world_member(substr((SELECT realtime.topic()), 7)::uuid, (SELECT auth.uid()))
      )
      OR (
        (SELECT realtime.topic()) ~ '^wiki:[0-9a-f-]{36}$'
        AND EXISTS (
          SELECT 1 FROM public.world_wiki_pages p
          WHERE p.id = substr((SELECT realtime.topic()), 6)::uuid
        )
      )
    )
  );

-- ── Envoi commun ─────────────────────────────────────────────────
-- Une diffusion ratée ne doit jamais faire échouer l'écriture qui l'a causée.
CREATE OR REPLACE FUNCTION public.wvlds_notify(p_topic text, p_event text, p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM realtime.send(p_payload, p_event, p_topic, true);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'wvlds_notify % % : %', p_topic, p_event, SQLERRM;
END;
$$;

-- ── Salons d'un monde ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_world_chatroom()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.chatrooms%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  -- `touch_chatroom_updated_at` réécrit la ligne à chaque message : sans ce
  -- filtre, chaque message ferait recharger la liste des salons de tous.
  IF TG_OP = 'UPDATE' AND
     (NEW.world_id, NEW.title, NEW.name, NEW.tag, NEW.banner_url, NEW.icon_url, NEW.category_id,
      NEW.timeline_date, NEW.map_pin_id, NEW.arc_id, NEW.status)
     IS NOT DISTINCT FROM
     (OLD.world_id, OLD.title, OLD.name, OLD.tag, OLD.banner_url, OLD.icon_url, OLD.category_id,
      OLD.timeline_date, OLD.map_pin_id, OLD.arc_id, OLD.status) THEN
    RETURN NULL;
  END IF;
  IF r.world_id IS NOT NULL THEN
    PERFORM public.wvlds_notify('world:' || r.world_id::text, 'chatroom',
      jsonb_build_object('op', TG_OP, 'id', r.id, 'title', r.title, 'name', r.name,
                         'icon_url', r.icon_url, 'category_id', r.category_id));
  END IF;
  -- Salon déplacé d'un monde à l'autre : l'ancien monde le voit partir.
  IF TG_OP = 'UPDATE' AND OLD.world_id IS DISTINCT FROM NEW.world_id AND OLD.world_id IS NOT NULL THEN
    PERFORM public.wvlds_notify('world:' || OLD.world_id::text, 'chatroom',
      jsonb_build_object('op', 'DELETE', 'id', OLD.id));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_world_chatroom ON public.chatrooms;
CREATE TRIGGER trg_broadcast_world_chatroom
  AFTER INSERT OR UPDATE OR DELETE ON public.chatrooms
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_chatroom();

-- ── Catégories de salons ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_world_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.chatroom_categories%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  PERFORM public.wvlds_notify('world:' || r.world_id::text, 'category',
    jsonb_build_object('op', TG_OP, 'id', r.id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_world_category ON public.chatroom_categories;
CREATE TRIGGER trg_broadcast_world_category
  AFTER INSERT OR UPDATE OR DELETE ON public.chatroom_categories
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_category();

-- ── Dernier message d'un salon (liste et grille des salons) ──────
CREATE OR REPLACE FUNCTION public.broadcast_world_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.chatroom_summaries%ROWTYPE;
  monde uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  SELECT c.world_id INTO monde FROM public.chatrooms c WHERE c.id = r.chat_id;
  IF monde IS NULL THEN RETURN NULL; END IF;  -- salon supprimé avec son résumé
  IF TG_OP = 'DELETE' THEN
    PERFORM public.wvlds_notify('world:' || monde::text, 'summary',
      jsonb_build_object('op', TG_OP, 'chat_id', r.chat_id));
  ELSE
    PERFORM public.wvlds_notify('world:' || monde::text, 'summary',
      jsonb_build_object('op', TG_OP, 'chat_id', r.chat_id,
                         'last_message_at', r.last_message_at,
                         'last_message_author_id', r.last_message_author_id,
                         'last_message_persona_avatar_url', r.last_message_persona_avatar_url));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_world_summary ON public.chatroom_summaries;
CREATE TRIGGER trg_broadcast_world_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.chatroom_summaries
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_summary();

-- ── Chat en direct du monde ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_world_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.wvlds_notify('world:' || OLD.world_id::text, 'live',
      jsonb_build_object('op', TG_OP, 'id', OLD.id));
  ELSE
    PERFORM public.wvlds_notify('world:' || NEW.world_id::text, 'live',
      jsonb_build_object('op', TG_OP, 'record', to_jsonb(NEW)));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_world_live ON public.world_live_messages;
CREATE TRIGGER trg_broadcast_world_live
  AFTER INSERT OR DELETE ON public.world_live_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_live();

-- ── Carte (cartes, lieux, régions, liens) ────────────────────────
-- Les quatre tables sont lisibles par les membres du monde et son
-- propriétaire (membre lui aussi) : la ligne entière part sur le canal.
CREATE OR REPLACE FUNCTION public.broadcast_world_map()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ligne jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN ligne := to_jsonb(OLD); ELSE ligne := to_jsonb(NEW); END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.wvlds_notify('world:' || (ligne->>'world_id'), 'map',
      jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'id', ligne->'id'));
  ELSE
    PERFORM public.wvlds_notify('world:' || (ligne->>'world_id'), 'map',
      jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'record', ligne));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_world_map ON public.world_maps;
CREATE TRIGGER trg_broadcast_world_map
  AFTER INSERT OR UPDATE OR DELETE ON public.world_maps
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_map();
DROP TRIGGER IF EXISTS trg_broadcast_world_map ON public.world_map_pins;
CREATE TRIGGER trg_broadcast_world_map
  AFTER INSERT OR UPDATE OR DELETE ON public.world_map_pins
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_map();
DROP TRIGGER IF EXISTS trg_broadcast_world_map ON public.world_map_regions;
CREATE TRIGGER trg_broadcast_world_map
  AFTER INSERT OR UPDATE OR DELETE ON public.world_map_regions
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_map();
DROP TRIGGER IF EXISTS trg_broadcast_world_map ON public.world_map_pin_links;
CREATE TRIGGER trg_broadcast_world_map
  AFTER INSERT OR UPDATE OR DELETE ON public.world_map_pin_links
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_map();

-- ── Personas, membres, lexique : ids seuls, le client relit ──────
CREATE OR REPLACE FUNCTION public.broadcast_world_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ligne jsonb;
  evenement text;
  avis jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN ligne := to_jsonb(OLD); ELSE ligne := to_jsonb(NEW); END IF;
  IF ligne->>'world_id' IS NULL THEN RETURN NULL; END IF;
  evenement := CASE TG_TABLE_NAME
    WHEN 'personas' THEN 'persona'
    WHEN 'world_members' THEN 'member'
    WHEN 'world_lexicon_terms' THEN 'lexicon'
  END;
  avis := CASE TG_TABLE_NAME
    WHEN 'world_members' THEN jsonb_build_object('op', TG_OP, 'user_id', ligne->'user_id')
    ELSE jsonb_build_object('op', TG_OP, 'id', ligne->'id')
  END;
  PERFORM public.wvlds_notify('world:' || (ligne->>'world_id'), evenement, avis);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_world_ids ON public.personas;
CREATE TRIGGER trg_broadcast_world_ids
  AFTER INSERT OR UPDATE OR DELETE ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_ids();
DROP TRIGGER IF EXISTS trg_broadcast_world_ids ON public.world_members;
CREATE TRIGGER trg_broadcast_world_ids
  AFTER INSERT OR UPDATE OR DELETE ON public.world_members
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_ids();
DROP TRIGGER IF EXISTS trg_broadcast_world_ids ON public.world_lexicon_terms;
CREATE TRIGGER trg_broadcast_world_ids
  AFTER INSERT OR UPDATE OR DELETE ON public.world_lexicon_terms
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_ids();

-- ── Pages du wiki (raccourcis de l'accueil) ──────────────────────
-- Un brouillon ou une page restreinte ne s'annonce pas sur le canal du monde :
-- les membres qui ne peuvent pas la lire n'apprennent même pas qu'elle change.
CREATE OR REPLACE FUNCTION public.broadcast_world_wiki_page()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.world_wiki_pages%ROWTYPE;
  visible_avant boolean := false;
  visible_apres boolean := false;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF TG_OP <> 'INSERT' THEN
    visible_avant := OLD.deleted_at IS NULL AND (OLD.is_folder OR OLD.published_at IS NOT NULL)
                     AND NOT public.wwp_is_restricted(OLD.id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    visible_apres := NEW.deleted_at IS NULL AND (NEW.is_folder OR NEW.published_at IS NOT NULL)
                     AND NOT public.wwp_is_restricted(NEW.id);
  END IF;
  IF visible_avant OR visible_apres THEN
    PERFORM public.wvlds_notify('world:' || r.world_id::text, 'wiki_page',
      jsonb_build_object('op', TG_OP, 'id', r.id));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_world_wiki_page ON public.world_wiki_pages;
CREATE TRIGGER trg_broadcast_world_wiki_page
  AFTER INSERT OR UPDATE OR DELETE ON public.world_wiki_pages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_wiki_page();

-- ── Notes et annotations d'une page : canal de la page ───────────
CREATE OR REPLACE FUNCTION public.broadcast_wiki_page_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ligne jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN ligne := to_jsonb(OLD); ELSE ligne := to_jsonb(NEW); END IF;
  PERFORM public.wvlds_notify('wiki:' || (ligne->>'page_id'),
    CASE TG_TABLE_NAME
      WHEN 'world_wiki_page_notes' THEN 'note'
      WHEN 'world_wiki_page_note_categories' THEN 'note_category'
      ELSE 'annotation'
    END,
    jsonb_build_object('op', TG_OP, 'id', ligne->'id'));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_wiki_page_item ON public.world_wiki_page_notes;
CREATE TRIGGER trg_broadcast_wiki_page_item
  AFTER INSERT OR UPDATE OR DELETE ON public.world_wiki_page_notes
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_wiki_page_item();
DROP TRIGGER IF EXISTS trg_broadcast_wiki_page_item ON public.world_wiki_page_note_categories;
CREATE TRIGGER trg_broadcast_wiki_page_item
  AFTER INSERT OR UPDATE OR DELETE ON public.world_wiki_page_note_categories
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_wiki_page_item();
DROP TRIGGER IF EXISTS trg_broadcast_wiki_page_item ON public.world_wiki_page_annotations;
CREATE TRIGGER trg_broadcast_wiki_page_item
  AFTER INSERT OR UPDATE OR DELETE ON public.world_wiki_page_annotations
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_wiki_page_item();

-- ── Épingles d'un salon : canal du salon ─────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_room_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.wvlds_notify('room:' || OLD.chat_id::text, 'pin',
      jsonb_build_object('op', TG_OP, 'id', OLD.id));
  ELSE
    PERFORM public.wvlds_notify('room:' || NEW.chat_id::text, 'pin',
      jsonb_build_object('op', TG_OP, 'record', to_jsonb(NEW)));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_room_pin ON public.chat_pins;
CREATE TRIGGER trg_broadcast_room_pin
  AFTER INSERT OR UPDATE OR DELETE ON public.chat_pins
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_room_pin();

-- ── Messages privés : aux deux interlocuteurs ────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_dm_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.dm_messages%ROWTYPE;
  conv public.dm_conversations%ROWTYPE;
  avis jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  SELECT * INTO conv FROM public.dm_conversations WHERE id = r.conversation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    avis := jsonb_build_object('op', TG_OP, 'id', r.id, 'conversation_id', r.conversation_id);
  ELSE
    avis := jsonb_build_object('op', TG_OP, 'record', to_jsonb(r));
  END IF;
  PERFORM public.wvlds_notify('msgs:' || conv.participant_a::text, 'dm', avis);
  IF conv.participant_b IS DISTINCT FROM conv.participant_a THEN
    PERFORM public.wvlds_notify('msgs:' || conv.participant_b::text, 'dm', avis);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_dm_message ON public.dm_messages;
CREATE TRIGGER trg_broadcast_dm_message
  AFTER INSERT OR UPDATE OR DELETE ON public.dm_messages
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_dm_message();

-- ── Notifications : au destinataire ──────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.wvlds_notify('msgs:' || NEW.recipient_id::text, 'notification',
    jsonb_build_object('op', TG_OP, 'id', NEW.id, 'chat_id', NEW.chat_id,
                       'archived', NEW.archived_at IS NOT NULL));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_notification ON public.notifications;
CREATE TRIGGER trg_broadcast_notification
  AFTER INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_notification();
