-- ──────────────────────────────────────────────────────────────────────────
-- 277 — Le temps d'un salon : celui du départ, et celui en cours.
--
-- Comme ses deux dates (`timeline_date`, `timeline_current_date`), un salon
-- garde deux temps : `day_icon`/`day_position`, celui du départ, réglé à la
-- création ou dans les réglages et affiché en tête du fil, que les ellipses
-- ne touchent plus ; `day_current_icon`/`day_current_position`, celui en
-- cours, que chaque ellipse avance (nul avant la première).
--
-- Le saut de la dernière ellipse (`day_from_*`, `day_skipped`) ne sert plus :
-- chaque ellipse garde le sien dans `chatroom_ellipses`. Les colonnes restent
-- le temps que la version déployée cesse de les lire.
-- DROP après déploiement :
--   ALTER TABLE public.chatrooms DROP COLUMN day_from_icon,
--     DROP COLUMN day_from_position, DROP COLUMN day_skipped;
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.chatrooms
  ADD COLUMN IF NOT EXISTS day_current_icon text,
  ADD COLUMN IF NOT EXISTS day_current_position smallint;

ALTER TABLE public.chatrooms
  DROP CONSTRAINT IF EXISTS chatrooms_day_current_icon_check,
  DROP CONSTRAINT IF EXISTS chatrooms_day_current_position_check,
  DROP CONSTRAINT IF EXISTS chatrooms_day_current_pair_check;

ALTER TABLE public.chatrooms
  ADD CONSTRAINT chatrooms_day_current_icon_check
    CHECK (day_current_icon IS NULL OR day_current_icon ~ '^[a-z0-9-]{1,40}$'),
  ADD CONSTRAINT chatrooms_day_current_position_check
    CHECK (day_current_position IS NULL OR day_current_position BETWEEN 0 AND 100),
  ADD CONSTRAINT chatrooms_day_current_pair_check
    CHECK ((day_current_icon IS NULL) = (day_current_position IS NULL));

-- ── Les salons qui ont déjà des ellipses ────────────────────
-- Le temps affiché était celui de la dernière : il devient le temps en cours,
-- et le départ redevient ce qu'il était avant la première ellipse.
UPDATE public.chatrooms c
   SET day_current_icon = c.day_icon,
       day_current_position = c.day_position,
       day_icon = f.from_icon,
       day_position = f.from_position,
       day_from_icon = NULL,
       day_from_position = NULL,
       day_skipped = 0
  FROM (
    SELECT DISTINCT ON (e.chat_id) e.chat_id, e.from_icon, e.from_position
      FROM public.chatroom_ellipses e
     ORDER BY e.chat_id, e.created_at, e.id
  ) f
 WHERE f.chat_id = c.id;

-- ── Poster une ellipse : seul le temps en cours avance ──────
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
  v_uid       uuid := auth.uid();
  v_room      public.chatrooms;
  v_config    jsonb;
  v_from      jsonb;
  v_to        jsonb;
  v_from_icon text;
  v_from_pos  smallint;
  v_row       public.chatroom_ellipses;
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

  -- Le saut part du temps en cours, sinon de celui du départ.
  IF v_room.day_current_icon IS NOT NULL THEN
    v_from_icon := v_room.day_current_icon;
    v_from_pos := v_room.day_current_position;
  ELSE
    v_from_icon := v_room.day_icon;
    v_from_pos := v_room.day_position;
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
  VALUES (v_room.world_id, p_chat, v_uid, p_days, v_from_icon, v_from_pos, p_icon, p_position, v_from, v_to)
  RETURNING * INTO v_row;

  UPDATE public.chatrooms c
     SET day_current_icon = p_icon,
         day_current_position = p_position,
         timeline_current_date = CASE WHEN v_to IS DISTINCT FROM v_room.timeline_date THEN v_to ELSE c.timeline_current_date END
   WHERE c.id = p_chat;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.post_chatroom_ellipse(uuid, integer, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_chatroom_ellipse(uuid, integer, text, integer) TO authenticated;

-- ── Régler le temps du départ ───────────────────────────────
-- Comme la modification du salon : son créateur, ou `chatrooms.manage`.
-- `p_icon` NULL retire le temps du départ ; le temps en cours reste.
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
         day_position = CASE WHEN p_icon IS NULL THEN NULL ELSE p_position END
   WHERE c.id = p_chat;
END;
$$;

REVOKE ALL ON FUNCTION public.set_chatroom_day(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_chatroom_day(uuid, text, integer) TO authenticated;

-- ── Temps réel : les deux temps ─────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_room_patch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.title, NEW.name, NEW.banner_url, NEW.icon_url, NEW.synopsis, NEW.visibility,
      NEW.day_icon, NEW.day_position, NEW.day_current_icon, NEW.day_current_position,
      NEW.timeline_date, NEW.timeline_current_date)
     IS DISTINCT FROM (OLD.title, OLD.name, OLD.banner_url, OLD.icon_url, OLD.synopsis, OLD.visibility,
      OLD.day_icon, OLD.day_position, OLD.day_current_icon, OLD.day_current_position,
      OLD.timeline_date, OLD.timeline_current_date) THEN
    PERFORM realtime.send(
      jsonb_build_object('title', NEW.title, 'name', NEW.name, 'banner_url', NEW.banner_url,
                         'icon_url', NEW.icon_url, 'synopsis', NEW.synopsis, 'visibility', NEW.visibility,
                         'day_icon', NEW.day_icon, 'day_position', NEW.day_position,
                         'day_current_icon', NEW.day_current_icon, 'day_current_position', NEW.day_current_position,
                         'timeline_date', NEW.timeline_date, 'timeline_current_date', NEW.timeline_current_date),
      'chatroom', 'room:' || NEW.id::text, true);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_patch : %', SQLERRM;
  RETURN NULL;
END;
$$;
