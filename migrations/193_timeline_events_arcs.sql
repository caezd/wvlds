-- ─────────────────────────────────────────────────────────────
-- Migration 193 — La chronologie raconte le monde, pas seulement ses salons
--
-- 1. `timeline.manage` : gérer la chronologie (ses événements et ses arcs ;
--    les saisons restent aux réglages du monde). Une permission à part, comme `wiki.comment` (migration 190) :
--    on la confie sans donner tout le wiki. Les rôles qui modifiaient déjà le
--    wiki la reçoivent ; un nouveau monde la donne à Éditeur.
-- 2. `world_timeline_events` : des jalons datés sans salon (« Couronnement
--    de la reine »), avec un texte et, au besoin, une page du wiki.
-- 3. `world_timeline_arcs` : des arcs narratifs nommés et colorés ; un
--    salon appartient à un arc au plus (`chatrooms.arc_id`).
-- 4. `chatrooms.previous_chatroom_id` : un salon fait suite à un autre, du
--    même monde, sans boucle.
-- 5. `get_chatroom_personas` : les personas qui ont écrit dans chaque salon
--    daté d'un monde, pour filtrer la frise par persona.
--
-- Les saisons (âges nommés) et l'affichage des journaux vivent dans
-- `worlds.timeline_config`, en JSON comme le reste du calendrier.
-- ─────────────────────────────────────────────────────────────

-- ── 1. La liste canonique ────────────────────────────────────
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
    'messages.post', 'chatrooms.create', 'chatrooms.manage', 'categories.manage',
    -- Contenu
    'wiki.edit', 'wiki.comment', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit', 'timeline.manage',
    -- Personas
    'relations.manage', 'personas.review', 'npc.manage', 'npc.play',
    -- Mentions
    'mentions.roles', 'mentions.everyone'
  ]::text[];
$$;

-- Les rôles qui modifiaient le wiki gèrent aussi la chronologie.
UPDATE public.world_roles
   SET permissions = permissions || ARRAY['timeline.manage']::text[]
 WHERE 'wiki.edit' = ANY (permissions)
   AND NOT ('timeline.manage' = ANY (permissions))
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
       'messages.post', 'chatrooms.create', 'chatrooms.manage', 'categories.manage',
       'wiki.edit', 'wiki.comment', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit', 'timeline.manage',
       'mentions.roles']::text[], false, false, true),
    (wid, 'Joueur',         '#22c55e', 10, ARRAY['messages.post', 'chatrooms.create', 'wiki.comment']::text[], true, false, true),
    (wid, 'Spectateur',     '#94a3b8',  0, '{}'::text[], false, false, true)
  ON CONFLICT (world_id, name) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.seed_default_world_roles(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Les événements ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_timeline_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id      uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  timeline_date jsonb NOT NULL,
  wiki_page_id  uuid REFERENCES public.world_wiki_pages(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_timeline_events_date_shape CHECK (
    jsonb_typeof(timeline_date) = 'object' AND jsonb_typeof(timeline_date->'year') = 'number'
  )
);
-- Bornes de longueur : voir lib/textLimits.ts.
ALTER TABLE public.world_timeline_events ADD CONSTRAINT world_timeline_events_title_nonempty CHECK (btrim(title) <> '');
ALTER TABLE public.world_timeline_events ADD CONSTRAINT world_timeline_events_title_len CHECK (char_length(title) <= 120);
ALTER TABLE public.world_timeline_events ADD CONSTRAINT world_timeline_events_description_len CHECK (char_length(description) <= 2000);
CREATE INDEX IF NOT EXISTS world_timeline_events_world_idx ON public.world_timeline_events (world_id);
CREATE INDEX IF NOT EXISTS world_timeline_events_wiki_page_idx ON public.world_timeline_events (wiki_page_id) WHERE wiki_page_id IS NOT NULL;

-- La page du wiki appartient au même monde ; `updated_at` suit l'écriture.
CREATE OR REPLACE FUNCTION public.tg_world_timeline_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.wiki_page_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.world_wiki_pages p WHERE p.id = NEW.wiki_page_id AND p.world_id = NEW.world_id
  ) THEN
    RAISE EXCEPTION 'La page du wiki doit appartenir au même monde que l''événement.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.world_id := OLD.world_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_timeline_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_world_timeline_event ON public.world_timeline_events;
CREATE TRIGGER trg_world_timeline_event
  BEFORE INSERT OR UPDATE ON public.world_timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_timeline_event();

ALTER TABLE public.world_timeline_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS world_timeline_events_select ON public.world_timeline_events;
CREATE POLICY world_timeline_events_select ON public.world_timeline_events
  FOR SELECT TO authenticated
  USING (public.is_world_member(world_id, (select auth.uid())));
DROP POLICY IF EXISTS world_timeline_events_insert ON public.world_timeline_events;
CREATE POLICY world_timeline_events_insert ON public.world_timeline_events
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (select auth.uid())
    AND public.has_world_permission(world_id, (select auth.uid()), 'timeline.manage')
  );
DROP POLICY IF EXISTS world_timeline_events_update ON public.world_timeline_events;
CREATE POLICY world_timeline_events_update ON public.world_timeline_events
  FOR UPDATE TO authenticated
  USING (public.has_world_permission(world_id, (select auth.uid()), 'timeline.manage'))
  WITH CHECK (public.has_world_permission(world_id, (select auth.uid()), 'timeline.manage'));
DROP POLICY IF EXISTS world_timeline_events_delete ON public.world_timeline_events;
CREATE POLICY world_timeline_events_delete ON public.world_timeline_events
  FOR DELETE TO authenticated
  USING (public.has_world_permission(world_id, (select auth.uid()), 'timeline.manage'));

-- ── 3. Les arcs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_timeline_arcs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id   uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#94a3b8',
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_timeline_arcs_color_hex CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT world_timeline_arcs_name_unique UNIQUE (world_id, name)
);
ALTER TABLE public.world_timeline_arcs ADD CONSTRAINT world_timeline_arcs_name_nonempty CHECK (btrim(name) <> '');
ALTER TABLE public.world_timeline_arcs ADD CONSTRAINT world_timeline_arcs_name_len CHECK (char_length(name) <= 60);

ALTER TABLE public.world_timeline_arcs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS world_timeline_arcs_select ON public.world_timeline_arcs;
CREATE POLICY world_timeline_arcs_select ON public.world_timeline_arcs
  FOR SELECT TO authenticated
  USING (public.is_world_member(world_id, (select auth.uid())));
DROP POLICY IF EXISTS world_timeline_arcs_insert ON public.world_timeline_arcs;
CREATE POLICY world_timeline_arcs_insert ON public.world_timeline_arcs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_world_permission(world_id, (select auth.uid()), 'timeline.manage'));
DROP POLICY IF EXISTS world_timeline_arcs_update ON public.world_timeline_arcs;
CREATE POLICY world_timeline_arcs_update ON public.world_timeline_arcs
  FOR UPDATE TO authenticated
  USING (public.has_world_permission(world_id, (select auth.uid()), 'timeline.manage'))
  WITH CHECK (public.has_world_permission(world_id, (select auth.uid()), 'timeline.manage'));
DROP POLICY IF EXISTS world_timeline_arcs_delete ON public.world_timeline_arcs;
CREATE POLICY world_timeline_arcs_delete ON public.world_timeline_arcs
  FOR DELETE TO authenticated
  USING (public.has_world_permission(world_id, (select auth.uid()), 'timeline.manage'));

-- ── 4. Arc et suite d'un salon ───────────────────────────────
ALTER TABLE public.chatrooms
  ADD COLUMN IF NOT EXISTS arc_id uuid REFERENCES public.world_timeline_arcs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_chatroom_id uuid REFERENCES public.chatrooms(id) ON DELETE SET NULL;
ALTER TABLE public.chatrooms DROP CONSTRAINT IF EXISTS chatrooms_previous_not_self;
ALTER TABLE public.chatrooms ADD CONSTRAINT chatrooms_previous_not_self CHECK (previous_chatroom_id IS DISTINCT FROM id);
CREATE INDEX IF NOT EXISTS chatrooms_arc_idx ON public.chatrooms (arc_id) WHERE arc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chatrooms_previous_idx ON public.chatrooms (previous_chatroom_id) WHERE previous_chatroom_id IS NOT NULL;

-- L'arc et le salon précédent sont du même monde ; une suite ne boucle pas.
CREATE OR REPLACE FUNCTION public.tg_chatroom_timeline_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cursor uuid;
  v_steps  integer := 0;
BEGIN
  IF NEW.arc_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.world_timeline_arcs a WHERE a.id = NEW.arc_id AND a.world_id = NEW.world_id
  ) THEN
    RAISE EXCEPTION 'L''arc doit appartenir au même monde que le salon.';
  END IF;
  IF NEW.previous_chatroom_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.chatrooms c WHERE c.id = NEW.previous_chatroom_id AND c.world_id = NEW.world_id
    ) THEN
      RAISE EXCEPTION 'Un salon ne fait suite qu''à un salon du même monde.';
    END IF;
    -- Remonter la chaîne : retrouver ce salon, c'est une boucle.
    v_cursor := NEW.previous_chatroom_id;
    WHILE v_cursor IS NOT NULL AND v_steps < 500 LOOP
      IF v_cursor = NEW.id THEN
        RAISE EXCEPTION 'Cette suite formerait une boucle.';
      END IF;
      SELECT c.previous_chatroom_id INTO v_cursor FROM public.chatrooms c WHERE c.id = v_cursor;
      v_steps := v_steps + 1;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_chatroom_timeline_links() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_chatroom_timeline_links ON public.chatrooms;
CREATE TRIGGER trg_chatroom_timeline_links
  BEFORE INSERT OR UPDATE OF arc_id, previous_chatroom_id ON public.chatrooms
  FOR EACH ROW EXECUTE FUNCTION public.tg_chatroom_timeline_links();

-- ── 5. Les personas d'un salon ───────────────────────────────
-- SECURITY INVOKER : les politiques de lecture des messages s'appliquent.
CREATE OR REPLACE FUNCTION public.get_chatroom_personas(p_world_id uuid)
RETURNS TABLE (chat_id uuid, persona_id uuid, persona_name text)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT m.chat_id, m.persona_id, p.name
    FROM public.chat_messages m
    JOIN public.chatrooms c ON c.id = m.chat_id AND c.timeline_date IS NOT NULL
    JOIN public.personas p ON p.id = m.persona_id
   WHERE m.world_id = p_world_id
     AND m.persona_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_chatroom_personas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chatroom_personas(uuid) TO authenticated;
