-- ──────────────────────────────────────────────────────────────────────────
-- 275 — Le temps d'un salon : météo, moment de la journée, ellipses.
--
-- Un salon porte une icône de météo (`day_icon`, un nom d'icône lucide) posée
-- à un moment de la journée (`day_position`, de 0 = aube à 100 = nuit). Une
-- ellipse (bloc du composeur) déplace l'icône et fait passer des jours : le
-- salon garde le saut de la dernière (`day_from_*`, `day_skipped`) pour
-- l'afficher en pointillés.
--
-- Deux dates : `timeline_date` reste la date de début du salon ; les jours
-- des ellipses avancent `timeline_current_date`, sa date d'avancée. La plage
-- des deux pourra se lire plus tard sur la chronologie.
--
-- Le texte des messages est chiffré : la base ne lit pas le bloc. Comme les
-- dés (migration 270), l'ellipse passe par une RPC qui écrit sa ligne
-- (`chatroom_ellipses`) et met le salon à jour ; le message la désigne par
-- `chat_messages.ellipse_id`, et l'affichage lit cette ligne, jamais le texte.
-- ──────────────────────────────────────────────────────────────────────────

-- ── Le salon ────────────────────────────────────────────────
ALTER TABLE public.chatrooms
  ADD COLUMN IF NOT EXISTS day_icon text,
  ADD COLUMN IF NOT EXISTS day_position smallint,
  ADD COLUMN IF NOT EXISTS day_from_icon text,
  ADD COLUMN IF NOT EXISTS day_from_position smallint,
  ADD COLUMN IF NOT EXISTS day_skipped integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timeline_current_date jsonb;

ALTER TABLE public.chatrooms
  DROP CONSTRAINT IF EXISTS chatrooms_day_icon_check,
  DROP CONSTRAINT IF EXISTS chatrooms_day_from_icon_check,
  DROP CONSTRAINT IF EXISTS chatrooms_day_position_check,
  DROP CONSTRAINT IF EXISTS chatrooms_day_from_position_check,
  DROP CONSTRAINT IF EXISTS chatrooms_day_pair_check,
  DROP CONSTRAINT IF EXISTS chatrooms_day_skipped_check,
  DROP CONSTRAINT IF EXISTS chatrooms_timeline_current_date_shape;

ALTER TABLE public.chatrooms
  ADD CONSTRAINT chatrooms_day_icon_check CHECK (day_icon IS NULL OR day_icon ~ '^[a-z0-9-]{1,40}$'),
  ADD CONSTRAINT chatrooms_day_from_icon_check CHECK (day_from_icon IS NULL OR day_from_icon ~ '^[a-z0-9-]{1,40}$'),
  ADD CONSTRAINT chatrooms_day_position_check CHECK (day_position IS NULL OR day_position BETWEEN 0 AND 100),
  ADD CONSTRAINT chatrooms_day_from_position_check CHECK (day_from_position IS NULL OR day_from_position BETWEEN 0 AND 100),
  -- Une icône a toujours sa place sur la ligne, et inversement.
  ADD CONSTRAINT chatrooms_day_pair_check CHECK ((day_icon IS NULL) = (day_position IS NULL)),
  ADD CONSTRAINT chatrooms_day_skipped_check CHECK (day_skipped BETWEEN 0 AND 36500),
  ADD CONSTRAINT chatrooms_timeline_current_date_shape CHECK (
    timeline_current_date IS NULL
    OR (jsonb_typeof(timeline_current_date) = 'object' AND jsonb_typeof(timeline_current_date -> 'year') = 'number')
  );

-- ── Ajouter des jours à une date de chronologie ─────────────
-- Miroir de `addTimelineDays` (lib/chatroomDay.ts). Une date sans mois (une
-- année seule) ne bouge pas ; sans jour, elle part du 1er du mois. Les mois
-- ont la longueur de `days_per_month` (bornée à 1-999, 30 par défaut).
CREATE OR REPLACE FUNCTION public.timeline_add_days(p_date jsonb, p_days integer, p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_months integer := coalesce(jsonb_array_length(p_config -> 'month_names'), 0);
  v_year   integer;
  v_month  integer;
  v_day    integer;
  v_dim    integer;
BEGIN
  IF p_date IS NULL OR p_days IS NULL OR p_days <= 0 OR v_months = 0
     OR jsonb_typeof(p_date -> 'month') IS DISTINCT FROM 'number' THEN
    RETURN p_date;
  END IF;
  v_year := (p_date ->> 'year')::integer;
  v_month := least(greatest((p_date ->> 'month')::integer, 0), v_months - 1);
  v_day := CASE WHEN jsonb_typeof(p_date -> 'day') = 'number' THEN (p_date ->> 'day')::integer ELSE 1 END + p_days;
  LOOP
    v_dim := CASE WHEN jsonb_typeof(p_config -> 'days_per_month' -> v_month) = 'number'
                  THEN least(greatest(round((p_config -> 'days_per_month' ->> v_month)::numeric)::integer, 1), 999)
                  ELSE 30 END;
    EXIT WHEN v_day <= v_dim;
    v_day := v_day - v_dim;
    v_month := v_month + 1;
    IF v_month >= v_months THEN
      v_month := 0;
      v_year := v_year + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('year', v_year, 'month', v_month, 'day', v_day);
END;
$$;

-- La date d'avancée ne précède jamais le début : déplacer (ou retirer) la
-- date de début au-delà l'efface.
CREATE OR REPLACE FUNCTION public.tg_chatrooms_current_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.timeline_current_date IS NOT NULL
     AND (NEW.timeline_date IS NULL OR public.timeline_date_after(NEW.timeline_date, NEW.timeline_current_date)) THEN
    NEW.timeline_current_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chatrooms_current_date ON public.chatrooms;
CREATE TRIGGER trg_chatrooms_current_date
  BEFORE INSERT OR UPDATE OF timeline_date, timeline_current_date ON public.chatrooms
  FOR EACH ROW EXECUTE FUNCTION public.tg_chatrooms_current_date();

-- ── Les ellipses ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chatroom_ellipses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id      uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  chat_id       uuid NOT NULL REFERENCES public.chatrooms(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  days          integer NOT NULL CONSTRAINT chatroom_ellipses_days_check CHECK (days BETWEEN 0 AND 36500),
  from_icon     text,
  from_position smallint,
  to_icon       text NOT NULL,
  to_position   smallint NOT NULL CONSTRAINT chatroom_ellipses_to_position_check CHECK (to_position BETWEEN 0 AND 100),
  from_date     jsonb,
  to_date       jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatroom_ellipses_chat_idx ON public.chatroom_ellipses (chat_id);

ALTER TABLE public.chatroom_ellipses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS ellipse_id uuid REFERENCES public.chatroom_ellipses(id) ON DELETE SET NULL;

-- Une ellipse ne sert qu'à un message.
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_ellipse_idx
  ON public.chat_messages (ellipse_id) WHERE ellipse_id IS NOT NULL;

-- Une ellipse se lit comme le message qui la publie ; son auteur la lit aussi
-- avant de l'avoir publiée.
DROP POLICY IF EXISTS chatroom_ellipses_select ON public.chatroom_ellipses;
CREATE POLICY chatroom_ellipses_select ON public.chatroom_ellipses FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.ellipse_id = chatroom_ellipses.id)
  );

REVOKE ALL ON public.chatroom_ellipses FROM anon, authenticated;
GRANT SELECT ON public.chatroom_ellipses TO authenticated;

-- ── Poster une ellipse ──────────────────────────────────────
-- Qui peut écrire dans le salon peut y faire passer le temps. Rend la ligne
-- de l'ellipse, à désigner ensuite par le message qui la publie.
CREATE OR REPLACE FUNCTION public.post_chatroom_ellipse(
  p_chat     uuid,
  p_days     integer,
  p_icon     text,
  p_position integer
)
RETURNS public.chatroom_ellipses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_room   public.chatrooms;
  v_config jsonb;
  v_from   jsonb;
  v_to     jsonb;
  v_row    public.chatroom_ellipses;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_room FROM public.chatrooms c WHERE c.id = p_chat FOR UPDATE;
  IF NOT FOUND
     OR NOT public.can_read_chatroom(p_chat, v_uid)
     OR NOT public.has_world_permission(v_room.world_id, v_uid, 'messages.post') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF p_days IS NULL OR p_days NOT BETWEEN 0 AND 36500 THEN
    RAISE EXCEPTION 'ellipse_invalid_days' USING ERRCODE = '22023';
  END IF;
  IF p_icon IS NULL OR p_icon !~ '^[a-z0-9-]{1,40}$' THEN
    RAISE EXCEPTION 'ellipse_invalid_icon' USING ERRCODE = '22023';
  END IF;
  IF p_position IS NULL OR p_position NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'ellipse_invalid_position' USING ERRCODE = '22023';
  END IF;

  -- La date d'avancée part de la dernière, ou du début du salon.
  v_from := coalesce(v_room.timeline_current_date, v_room.timeline_date);
  IF v_from IS NOT NULL AND p_days > 0 THEN
    SELECT w.timeline_config INTO v_config FROM public.worlds w WHERE w.id = v_room.world_id;
    v_to := public.timeline_add_days(v_from, p_days, v_config);
  ELSE
    v_to := v_from;
  END IF;

  INSERT INTO public.chatroom_ellipses (world_id, chat_id, user_id, days, from_icon, from_position, to_icon, to_position, from_date, to_date)
  VALUES (v_room.world_id, p_chat, v_uid, p_days, v_room.day_icon, v_room.day_position, p_icon, p_position, v_from, v_to)
  RETURNING * INTO v_row;

  UPDATE public.chatrooms c
     SET day_icon = p_icon,
         day_position = p_position,
         -- Sans jour passé, l'icône se déplace sur la même ligne : pas de saut à montrer.
         day_from_icon = CASE WHEN p_days > 0 THEN v_room.day_icon END,
         day_from_position = CASE WHEN p_days > 0 THEN v_room.day_position END,
         day_skipped = p_days,
         timeline_current_date = CASE WHEN v_to IS DISTINCT FROM v_room.timeline_date THEN v_to ELSE c.timeline_current_date END
   WHERE c.id = p_chat;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.post_chatroom_ellipse(uuid, integer, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_chatroom_ellipse(uuid, integer, text, integer) TO authenticated;

-- ── Régler le temps de départ ───────────────────────────────
-- Comme la modification du salon : son créateur, ou `chatrooms.manage`.
-- Efface le saut affiché ; `p_icon` NULL retire le statut.
CREATE OR REPLACE FUNCTION public.set_chatroom_day(p_chat uuid, p_icon text, p_position integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.can_manage_chatroom_access(p_chat, v_uid) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  IF p_icon IS NOT NULL AND p_icon !~ '^[a-z0-9-]{1,40}$' THEN
    RAISE EXCEPTION 'ellipse_invalid_icon' USING ERRCODE = '22023';
  END IF;
  IF p_icon IS NOT NULL AND (p_position IS NULL OR p_position NOT BETWEEN 0 AND 100) THEN
    RAISE EXCEPTION 'ellipse_invalid_position' USING ERRCODE = '22023';
  END IF;

  UPDATE public.chatrooms c
     SET day_icon = p_icon,
         day_position = CASE WHEN p_icon IS NULL THEN NULL ELSE p_position END,
         day_from_icon = NULL,
         day_from_position = NULL,
         day_skipped = 0
   WHERE c.id = p_chat;
END;
$$;

REVOKE ALL ON FUNCTION public.set_chatroom_day(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_chatroom_day(uuid, text, integer) TO authenticated;

-- ── Le message d'une ellipse ────────────────────────────────
-- À l'insertion : l'ellipse appartient à l'auteur et au salon du message.
-- Ensuite son texte est figé : il ne dit rien, l'ellipse est en base.
CREATE OR REPLACE FUNCTION public.tg_chat_message_ellipse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ellipse public.chatroom_ellipses;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ellipse_id IS NOT NULL THEN
      SELECT * INTO v_ellipse FROM public.chatroom_ellipses e WHERE e.id = NEW.ellipse_id;
      IF NOT FOUND
         OR v_ellipse.user_id IS DISTINCT FROM auth.uid()
         OR v_ellipse.chat_id IS DISTINCT FROM NEW.chat_id THEN
        RAISE EXCEPTION 'ellipse_mismatch' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.ellipse_id IS NOT NULL AND NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'ellipse_locked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_message_ellipse ON public.chat_messages;
CREATE TRIGGER trg_chat_message_ellipse
  BEFORE INSERT OR UPDATE OF content ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_chat_message_ellipse();

-- ── Temps réel : le canal du salon porte aussi son temps ────
CREATE OR REPLACE FUNCTION public.broadcast_room_patch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.title, NEW.name, NEW.banner_url, NEW.icon_url, NEW.synopsis, NEW.visibility,
      NEW.day_icon, NEW.day_position, NEW.day_from_icon, NEW.day_from_position, NEW.day_skipped,
      NEW.timeline_date, NEW.timeline_current_date)
     IS DISTINCT FROM (OLD.title, OLD.name, OLD.banner_url, OLD.icon_url, OLD.synopsis, OLD.visibility,
      OLD.day_icon, OLD.day_position, OLD.day_from_icon, OLD.day_from_position, OLD.day_skipped,
      OLD.timeline_date, OLD.timeline_current_date) THEN
    PERFORM realtime.send(
      jsonb_build_object('title', NEW.title, 'name', NEW.name, 'banner_url', NEW.banner_url,
                         'icon_url', NEW.icon_url, 'synopsis', NEW.synopsis, 'visibility', NEW.visibility,
                         'day_icon', NEW.day_icon, 'day_position', NEW.day_position,
                         'day_from_icon', NEW.day_from_icon, 'day_from_position', NEW.day_from_position,
                         'day_skipped', NEW.day_skipped,
                         'timeline_date', NEW.timeline_date, 'timeline_current_date', NEW.timeline_current_date),
      'chatroom', 'room:' || NEW.id::text, true);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_patch : %', SQLERRM;
  RETURN NULL;
END;
$$;

-- Retour arrière :
-- DROP TRIGGER trg_chat_message_ellipse ON public.chat_messages;
-- DROP FUNCTION public.tg_chat_message_ellipse(), public.post_chatroom_ellipse(uuid, integer, text, integer),
--   public.set_chatroom_day(uuid, text, integer);
-- ALTER TABLE public.chat_messages DROP COLUMN ellipse_id;
-- DROP TABLE public.chatroom_ellipses;
-- DROP TRIGGER trg_chatrooms_current_date ON public.chatrooms;
-- DROP FUNCTION public.tg_chatrooms_current_date(), public.timeline_add_days(jsonb, integer, jsonb);
-- ALTER TABLE public.chatrooms DROP COLUMN day_icon, DROP COLUMN day_position, DROP COLUMN day_from_icon,
--   DROP COLUMN day_from_position, DROP COLUMN day_skipped, DROP COLUMN timeline_current_date;
-- (et broadcast_room_patch de la migration 225)
