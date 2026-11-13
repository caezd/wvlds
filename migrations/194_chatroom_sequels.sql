-- ─────────────────────────────────────────────────────────────
-- Migration 194 — Les joueurs relient leurs salons
--
-- La migration 193 donnait à un salon un seul salon précédent
-- (`chatrooms.previous_chatroom_id`), réglé par qui peut modifier le salon.
-- Entre personnages, ça ne suffit pas : deux scènes se rejoignent dans une
-- troisième, une scène se prolonge en deux. Les suites deviennent donc des
-- liens, plusieurs par salon, créés par les joueurs eux-mêmes.
--
-- 1. `chatrooms.link` : relier des salons. Donnée aux rôles qui créent des
--    salons ; un nouveau monde la donne à Joueur et Éditeur.
-- 2. On ne relie que ce qui nous concerne : on déclare que B suit A si l'on
--    a ouvert B ou écrit dedans (`is_chatroom_participant`). « Gérer les
--    salons » et « Gérer la chronologie » relient et défont tout.
-- 3. L'accord de l'autre côté : si l'on participe aussi à A, le lien est
--    accepté d'emblée ; sinon il est proposé, et ceux qui ont écrit dans A
--    reçoivent une demande (`sequel_request`) qu'un seul d'entre eux accepte.
--    Proposé, le lien se voit sur la frise, en pointillés.
-- 4. Pas de boucle, en comptant les liens proposés.
-- 5. `get_linkable_chatrooms` : les salons datés d'un monde, les siens en
--    premier, pour choisir un salon précédent.
--
-- Les suites de la migration 193 sont reprises, acceptées ; la colonne
-- `previous_chatroom_id` disparaît.
-- ─────────────────────────────────────────────────────────────

-- ── 1. La permission ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.world_permission_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    -- Général
    'administrator', 'world.settings', 'roles.manage', 'members.manage',
    -- Salons
    'messages.post', 'chatrooms.create', 'chatrooms.manage', 'chatrooms.link', 'categories.manage',
    -- Contenu
    'wiki.edit', 'wiki.comment', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit', 'timeline.manage',
    -- Personas
    'relations.manage', 'personas.review', 'npc.manage', 'npc.play',
    -- Mentions
    'mentions.roles', 'mentions.everyone'
  ]::text[];
$$;

UPDATE public.world_roles
   SET permissions = permissions || ARRAY['chatrooms.link']::text[]
 WHERE 'chatrooms.create' = ANY (permissions)
   AND NOT ('chatrooms.link' = ANY (permissions))
   AND NOT ('administrator' = ANY (permissions));

CREATE OR REPLACE FUNCTION public.seed_default_world_roles(wid uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.world_roles (world_id, name, color, position, permissions, is_default, mentionable, hoist)
  VALUES
    (wid, 'Administrateur', '#ef4444', 30, ARRAY['administrator']::text[], false, false, true),
    (wid, 'Éditeur',        '#3b82f6', 20, ARRAY[
       'messages.post', 'chatrooms.create', 'chatrooms.manage', 'chatrooms.link', 'categories.manage',
       'wiki.edit', 'wiki.comment', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit', 'timeline.manage',
       'mentions.roles']::text[], false, false, true),
    (wid, 'Joueur',         '#22c55e', 10, ARRAY['messages.post', 'chatrooms.create', 'chatrooms.link', 'wiki.comment']::text[], true, false, true),
    (wid, 'Spectateur',     '#94a3b8',  0, '{}'::text[], false, false, true)
  ON CONFLICT (world_id, name) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.seed_default_world_roles(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Qui participe à un salon ──────────────────────────────
-- SECURITY DEFINER : un message chuchoté qu'on ne lit pas compte quand même
-- pour son auteur. Ne révèle qu'un booléen.
CREATE OR REPLACE FUNCTION public.is_chatroom_participant(p_chat uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.chatrooms c WHERE c.id = p_chat AND c.created_by = p_uid)
    OR EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.chat_id = p_chat AND m.author_id = p_uid)
  );
$$;
REVOKE ALL ON FUNCTION public.is_chatroom_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chatroom_participant(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_chatroom_sequels(p_world uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_world_permission(p_world, p_uid, 'chatrooms.manage')
      OR public.has_world_permission(p_world, p_uid, 'timeline.manage');
$$;
REVOKE ALL ON FUNCTION public.can_manage_chatroom_sequels(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_chatroom_sequels(uuid, uuid) TO authenticated;

-- ── 3. Les liens ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chatroom_sequels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  -- La suite (B) et le salon qu'elle suit (A).
  chatroom_id uuid NOT NULL REFERENCES public.chatrooms(id) ON DELETE CASCADE,
  previous_id uuid NOT NULL REFERENCES public.chatrooms(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending',
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT chatroom_sequels_status CHECK (status IN ('pending', 'accepted')),
  CONSTRAINT chatroom_sequels_not_self CHECK (chatroom_id <> previous_id),
  CONSTRAINT chatroom_sequels_unique UNIQUE (chatroom_id, previous_id)
);
CREATE INDEX IF NOT EXISTS chatroom_sequels_world_idx ON public.chatroom_sequels (world_id);
CREATE INDEX IF NOT EXISTS chatroom_sequels_previous_idx ON public.chatroom_sequels (previous_id);

-- Les suites de la migration 193, acceptées.
INSERT INTO public.chatroom_sequels (world_id, chatroom_id, previous_id, status, created_by, accepted_by, accepted_at)
SELECT c.world_id, c.id, c.previous_chatroom_id, 'accepted', c.created_by, c.created_by, now()
  FROM public.chatrooms c
 WHERE c.previous_chatroom_id IS NOT NULL
ON CONFLICT (chatroom_id, previous_id) DO NOTHING;

-- L'arc seul reste vérifié sur le salon ; la colonne de suite disparaît.
CREATE OR REPLACE FUNCTION public.tg_chatroom_timeline_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.arc_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.world_timeline_arcs a WHERE a.id = NEW.arc_id AND a.world_id = NEW.world_id
  ) THEN
    RAISE EXCEPTION 'L''arc doit appartenir au même monde que le salon.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_chatroom_timeline_links() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_chatroom_timeline_links ON public.chatrooms;
CREATE TRIGGER trg_chatroom_timeline_links
  BEFORE INSERT OR UPDATE OF arc_id ON public.chatrooms
  FOR EACH ROW EXECUTE FUNCTION public.tg_chatroom_timeline_links();
ALTER TABLE public.chatrooms DROP COLUMN IF EXISTS previous_chatroom_id;

-- Avant l'écriture : même monde, pas de boucle, statut décidé ici (jamais
-- par le client), et seules l'acceptation et ses traces changent ensuite.
CREATE OR REPLACE FUNCTION public.tg_chatroom_sequel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_world   uuid;
  v_loop    boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT c.world_id INTO v_world FROM public.chatrooms c WHERE c.id = NEW.chatroom_id;
    IF v_world IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.chatrooms c WHERE c.id = NEW.previous_id AND c.world_id = v_world
    ) THEN
      RAISE EXCEPTION 'Un salon ne fait suite qu''à un salon du même monde.';
    END IF;
    NEW.world_id := v_world;

    -- Remonter les liens (proposés compris) depuis A : retrouver B, c'est une boucle.
    WITH RECURSIVE ancetres(id) AS (
      SELECT NEW.previous_id
      UNION
      SELECT s.previous_id FROM public.chatroom_sequels s JOIN ancetres a ON s.chatroom_id = a.id
    )
    SELECT EXISTS (SELECT 1 FROM ancetres WHERE id = NEW.chatroom_id) INTO v_loop;
    IF v_loop THEN
      RAISE EXCEPTION 'Cette suite formerait une boucle.';
    END IF;

    -- Hors session (administration), le statut fourni est gardé.
    IF v_uid IS NOT NULL THEN
      NEW.created_by := v_uid;
      IF public.can_manage_chatroom_sequels(v_world, v_uid) OR public.is_chatroom_participant(NEW.previous_id, v_uid) THEN
        NEW.status := 'accepted';
        NEW.accepted_by := v_uid;
        NEW.accepted_at := now();
      ELSE
        NEW.status := 'pending';
        NEW.accepted_by := NULL;
        NEW.accepted_at := NULL;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE : accepter, et rien d'autre.
  NEW.world_id := OLD.world_id;
  NEW.chatroom_id := OLD.chatroom_id;
  NEW.previous_id := OLD.previous_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF OLD.status = 'accepted' THEN
    NEW.status := 'accepted';
    NEW.accepted_by := OLD.accepted_by;
    NEW.accepted_at := OLD.accepted_at;
  ELSIF NEW.status = 'accepted' THEN
    NEW.accepted_by := COALESCE(v_uid, NEW.accepted_by);
    NEW.accepted_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_chatroom_sequel() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_chatroom_sequel ON public.chatroom_sequels;
CREATE TRIGGER trg_chatroom_sequel
  BEFORE INSERT OR UPDATE ON public.chatroom_sequels
  FOR EACH ROW EXECUTE FUNCTION public.tg_chatroom_sequel();

-- Après une proposition : ceux qui ont écrit dans A (ou l'ont ouvert),
-- hors le demandeur, reçoivent la demande.
CREATE OR REPLACE FUNCTION public.tg_chatroom_sequel_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  text;
  v_suite  text;
  v_prec   text;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  SELECT pr.username INTO v_actor FROM public.profiles pr WHERE pr.id = NEW.created_by;
  SELECT COALESCE(c.title, c.name) INTO v_suite FROM public.chatrooms c WHERE c.id = NEW.chatroom_id;
  SELECT COALESCE(c.title, c.name) INTO v_prec FROM public.chatrooms c WHERE c.id = NEW.previous_id;
  INSERT INTO public.notifications (recipient_id, type, world_id, actor_id, actor_name, content, metadata)
  SELECT p.uid, 'sequel_request', NEW.world_id, NEW.created_by, v_actor, left(v_suite, 200),
         jsonb_build_object('sequel_id', NEW.id, 'chatroom_title', left(v_suite, 200), 'previous_title', left(v_prec, 200))
    FROM (
      SELECT c.created_by AS uid FROM public.chatrooms c WHERE c.id = NEW.previous_id AND c.created_by IS NOT NULL
      UNION
      SELECT DISTINCT m.author_id FROM public.chat_messages m WHERE m.chat_id = NEW.previous_id AND m.author_id IS NOT NULL
    ) p
   WHERE p.uid IS DISTINCT FROM NEW.created_by
     AND public.is_world_member(NEW.world_id, p.uid)
   LIMIT 500;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_chatroom_sequel_notify() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_chatroom_sequel_notify ON public.chatroom_sequels;
CREATE TRIGGER trg_chatroom_sequel_notify
  AFTER INSERT ON public.chatroom_sequels
  FOR EACH ROW EXECUTE FUNCTION public.tg_chatroom_sequel_notify();

ALTER TABLE public.chatroom_sequels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chatroom_sequels_select ON public.chatroom_sequels;
CREATE POLICY chatroom_sequels_select ON public.chatroom_sequels
  FOR SELECT TO authenticated
  USING (public.is_world_member(world_id, (select auth.uid())));
DROP POLICY IF EXISTS chatroom_sequels_insert ON public.chatroom_sequels;
CREATE POLICY chatroom_sequels_insert ON public.chatroom_sequels
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND (
      public.can_manage_chatroom_sequels(world_id, (select auth.uid()))
      OR (
        public.has_world_permission(world_id, (select auth.uid()), 'chatrooms.link')
        AND public.is_chatroom_participant(chatroom_id, (select auth.uid()))
      )
    )
  );
DROP POLICY IF EXISTS chatroom_sequels_update ON public.chatroom_sequels;
CREATE POLICY chatroom_sequels_update ON public.chatroom_sequels
  FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND (
      public.can_manage_chatroom_sequels(world_id, (select auth.uid()))
      OR public.is_chatroom_participant(previous_id, (select auth.uid()))
    )
  )
  WITH CHECK (status = 'accepted');
DROP POLICY IF EXISTS chatroom_sequels_delete ON public.chatroom_sequels;
CREATE POLICY chatroom_sequels_delete ON public.chatroom_sequels
  FOR DELETE TO authenticated
  USING (
    created_by = (select auth.uid())
    OR public.can_manage_chatroom_sequels(world_id, (select auth.uid()))
    OR public.is_chatroom_participant(chatroom_id, (select auth.uid()))
    OR public.is_chatroom_participant(previous_id, (select auth.uid()))
  );

-- ── 4. Le type de notification ───────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite',
    'chatroom_reply', 'persona_new_chatroom', 'persona_reply', 'relation_request',
    'role_mention', 'everyone_mention', 'persona_submitted', 'persona_reviewed',
    'sequel_request'
  ));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_type_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'chatroom_reply',
    'persona_new_chatroom', 'persona_reply', 'relation_request',
    'role_mention', 'everyone_mention', 'persona_submitted', 'persona_reviewed',
    'sequel_request'
  ));

-- ── 5. Les salons à relier ───────────────────────────────────
-- SECURITY INVOKER : on ne voit que les salons qu'on peut lire.
CREATE OR REPLACE FUNCTION public.get_linkable_chatrooms(p_world_id uuid)
RETURNS TABLE (id uuid, title text, timeline_date jsonb, mine boolean, last_at timestamptz)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT c.id,
         COALESCE(c.title, c.name),
         c.timeline_date,
         public.is_chatroom_participant(c.id, (select auth.uid())),
         (SELECT max(m.created_at) FROM public.chat_messages m WHERE m.chat_id = c.id)
    FROM public.chatrooms c
   WHERE c.world_id = p_world_id
     AND c.timeline_date IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_linkable_chatrooms(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_linkable_chatrooms(uuid) TO authenticated;
