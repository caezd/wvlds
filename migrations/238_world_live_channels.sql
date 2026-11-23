-- 238 — Chatbox : salles, fil de chaque salon de jeu, réponses.
--
-- 1. `world_live_channels` : les salles personnalisées d'un monde (nom,
--    couleur, icône Lucide — « # » sans icône —, rang). Lues par les
--    membres, réglées sous `world.settings`. La salle principale n'est pas
--    une ligne : c'est l'absence de salle (`channel_id` nul), où restent les
--    messages d'avant cette migration.
-- 2. `world_live_messages` gagne :
--    - `channel_id` : la salle personnalisée (supprimée avec elle) ;
--    - `chatroom_id` : le fil d'un salon de jeu, qui réunit les discussions
--      hors-jeu sur ce salon (supprimé avec lui). Lisible seulement par qui
--      voit le salon (RLS de `chatrooms`, en invocateur) ;
--    - `reply_to_id` : le message auquel on répond (dans la même salle).
--    Un message va dans une salle OU dans un fil de salon, jamais les deux.
-- 3. Rétention : 500 messages par salle (et par fil), plus par monde.
-- 4. Temps réel (canal privé `world:<id>`, événement `live`) : un message
--    d'un fil de salon part SANS son contenu — un salon privé ne doit rien
--    laisser voir aux membres qui ne le voient pas ; le client le relit, avec
--    ses propres droits. Les salles ont leur événement, `live_channels`.

-- ── 1. Salles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_live_channels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id   uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text,
  icon       text,
  sort_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_live_channels_name_len CHECK (btrim(name) <> '' AND char_length(name) <= 40),
  CONSTRAINT world_live_channels_color_hex CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT world_live_channels_icon_name CHECK (icon IS NULL OR icon ~ '^[a-z0-9-]{1,64}$')
);
CREATE INDEX IF NOT EXISTS world_live_channels_world_idx ON public.world_live_channels (world_id, sort_index);

ALTER TABLE public.world_live_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS world_live_channels_select ON public.world_live_channels;
CREATE POLICY world_live_channels_select ON public.world_live_channels
  FOR SELECT TO authenticated
  USING (public.is_world_member(world_id, (select auth.uid())));

DROP POLICY IF EXISTS world_live_channels_insert ON public.world_live_channels;
CREATE POLICY world_live_channels_insert ON public.world_live_channels
  FOR INSERT TO authenticated
  WITH CHECK (public.has_world_permission(world_id, (select auth.uid()), 'world.settings'));

DROP POLICY IF EXISTS world_live_channels_update ON public.world_live_channels;
CREATE POLICY world_live_channels_update ON public.world_live_channels
  FOR UPDATE TO authenticated
  USING (public.has_world_permission(world_id, (select auth.uid()), 'world.settings'))
  WITH CHECK (public.has_world_permission(world_id, (select auth.uid()), 'world.settings'));

DROP POLICY IF EXISTS world_live_channels_delete ON public.world_live_channels;
CREATE POLICY world_live_channels_delete ON public.world_live_channels
  FOR DELETE TO authenticated
  USING (public.has_world_permission(world_id, (select auth.uid()), 'world.settings'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.world_live_channels TO authenticated;
REVOKE ALL ON public.world_live_channels FROM anon;

-- Un monde ne change pas de salle d'un autre : le rang seul se réordonne.
CREATE OR REPLACE FUNCTION public.reorder_world_live_channels(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items doit être un tableau JSON';
  END IF;
  UPDATE public.world_live_channels t
     SET sort_index = e.sort_index
    FROM jsonb_to_recordset(p_items) AS e(id uuid, sort_index integer)
   WHERE t.id = e.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.reorder_world_live_channels(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reorder_world_live_channels(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.broadcast_world_live_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.wvlds_notify('world:' || OLD.world_id::text, 'live_channels',
      jsonb_build_object('op', TG_OP, 'id', OLD.id));
  ELSE
    PERFORM public.wvlds_notify('world:' || NEW.world_id::text, 'live_channels',
      jsonb_build_object('op', TG_OP, 'record', to_jsonb(NEW)));
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_world_live_channel() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_broadcast_world_live_channel ON public.world_live_channels;
CREATE TRIGGER trg_broadcast_world_live_channel
  AFTER INSERT OR UPDATE OR DELETE ON public.world_live_channels
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_live_channel();

-- ── 2. Messages : salle, fil de salon, réponse ───────────────
ALTER TABLE public.world_live_messages
  ADD COLUMN IF NOT EXISTS channel_id  uuid REFERENCES public.world_live_channels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS chatroom_id uuid REFERENCES public.chatrooms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.world_live_messages(id) ON DELETE SET NULL;

ALTER TABLE public.world_live_messages DROP CONSTRAINT IF EXISTS world_live_messages_one_place;
ALTER TABLE public.world_live_messages
  ADD CONSTRAINT world_live_messages_one_place CHECK (channel_id IS NULL OR chatroom_id IS NULL);

CREATE INDEX IF NOT EXISTS world_live_messages_channel_idx
  ON public.world_live_messages (channel_id, created_at DESC) WHERE channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS world_live_messages_chatroom_idx
  ON public.world_live_messages (chatroom_id, created_at DESC) WHERE chatroom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS world_live_messages_reply_idx
  ON public.world_live_messages (reply_to_id) WHERE reply_to_id IS NOT NULL;

-- Rythme (inchangé) et cohérence : la salle, le salon et le message cité
-- appartiennent au monde du message ; on ne répond que dans la même salle.
CREATE OR REPLACE FUNCTION public.tg_world_live_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.created_at := now();
  IF NEW.channel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.world_live_channels c WHERE c.id = NEW.channel_id AND c.world_id = NEW.world_id
  ) THEN
    RAISE EXCEPTION 'Salle inconnue dans ce monde.' USING ERRCODE = '22023';
  END IF;
  IF NEW.chatroom_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.chatrooms r WHERE r.id = NEW.chatroom_id AND r.world_id = NEW.world_id
  ) THEN
    RAISE EXCEPTION 'Salon inconnu dans ce monde.' USING ERRCODE = '22023';
  END IF;
  IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.world_live_messages m
     WHERE m.id = NEW.reply_to_id
       AND m.world_id = NEW.world_id
       AND m.channel_id IS NOT DISTINCT FROM NEW.channel_id
       AND m.chatroom_id IS NOT DISTINCT FROM NEW.chatroom_id
  ) THEN
    RAISE EXCEPTION 'Réponse à un message d''une autre salle.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.world_live_messages m
     WHERE m.world_id = NEW.world_id
       AND m.user_id = NEW.user_id
       AND m.created_at > now() - interval '1 second'
  ) THEN
    RAISE EXCEPTION 'Trop de messages : patientez un instant.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Rétention : 500 messages par salle ────────────────────
CREATE OR REPLACE FUNCTION public.tg_world_live_message_prune()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cutoff timestamptz;
BEGIN
  IF NEW.channel_id IS NOT NULL THEN
    SELECT m.created_at INTO v_cutoff FROM public.world_live_messages m
     WHERE m.channel_id = NEW.channel_id
     ORDER BY m.created_at DESC OFFSET 500 LIMIT 1;
    IF v_cutoff IS NOT NULL THEN
      DELETE FROM public.world_live_messages m
       WHERE m.channel_id = NEW.channel_id AND m.created_at <= v_cutoff;
    END IF;
  ELSIF NEW.chatroom_id IS NOT NULL THEN
    SELECT m.created_at INTO v_cutoff FROM public.world_live_messages m
     WHERE m.chatroom_id = NEW.chatroom_id
     ORDER BY m.created_at DESC OFFSET 500 LIMIT 1;
    IF v_cutoff IS NOT NULL THEN
      DELETE FROM public.world_live_messages m
       WHERE m.chatroom_id = NEW.chatroom_id AND m.created_at <= v_cutoff;
    END IF;
  ELSE
    SELECT m.created_at INTO v_cutoff FROM public.world_live_messages m
     WHERE m.world_id = NEW.world_id AND m.channel_id IS NULL AND m.chatroom_id IS NULL
     ORDER BY m.created_at DESC OFFSET 500 LIMIT 1;
    IF v_cutoff IS NOT NULL THEN
      DELETE FROM public.world_live_messages m
       WHERE m.world_id = NEW.world_id AND m.channel_id IS NULL AND m.chatroom_id IS NULL
         AND m.created_at <= v_cutoff;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- ── RLS : le fil d'un salon suit la visibilité du salon ──────
ALTER POLICY world_live_messages_select ON public.world_live_messages
  USING (
    public.is_world_member(world_live_messages.world_id, (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.worlds w
       WHERE w.id = world_live_messages.world_id AND w.enable_live_chat
    )
    AND (
      world_live_messages.chatroom_id IS NULL
      OR EXISTS (SELECT 1 FROM public.chatrooms r WHERE r.id = world_live_messages.chatroom_id)
    )
  );

ALTER POLICY world_live_messages_insert ON public.world_live_messages
  WITH CHECK (
    user_id = (select auth.uid())
    AND public.is_world_member(world_live_messages.world_id, (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.worlds w
       WHERE w.id = world_live_messages.world_id AND w.enable_live_chat
    )
    AND (
      world_live_messages.chatroom_id IS NULL
      OR EXISTS (SELECT 1 FROM public.chatrooms r WHERE r.id = world_live_messages.chatroom_id)
    )
  );

-- ── 4. Temps réel ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_world_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.wvlds_notify('world:' || OLD.world_id::text, 'live',
      jsonb_build_object('op', TG_OP, 'id', OLD.id, 'channel_id', OLD.channel_id, 'chatroom_id', OLD.chatroom_id));
  ELSIF NEW.chatroom_id IS NOT NULL THEN
    -- Fil d'un salon : l'avis seul ; le client relit le message (RLS).
    PERFORM public.wvlds_notify('world:' || NEW.world_id::text, 'live',
      jsonb_build_object('op', TG_OP, 'id', NEW.id, 'chatroom_id', NEW.chatroom_id));
  ELSE
    PERFORM public.wvlds_notify('world:' || NEW.world_id::text, 'live',
      jsonb_build_object('op', TG_OP, 'record', to_jsonb(NEW)));
  END IF;
  RETURN NULL;
END;
$$;
