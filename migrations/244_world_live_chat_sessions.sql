-- 244 — Chatbox : connexion, déconnexion pour inactivité, messages système.
--
-- 1. Réglages du monde (Paramètres › Fonctions › Chatbox › Connexion) :
--    - `live_chat_join_mode` : 'auto', connecté dès l'arrivée dans le monde
--      (comme avant) ; 'button', connecté en cliquant sur « Rejoindre » ;
--    - `live_chat_idle_minutes` : sans message ni frappe pendant ce temps, le
--      joueur est déconnecté ; nul : jamais ;
--    - `live_chat_offline_view` : ce que voit un joueur non connecté, 'none'
--      (rien, par défaut) ou 'read' (lecture seule). Affichage seulement :
--      tout membre peut rejoindre, ce n'est pas un secret.
--    'auto' sans délai (le défaut) : pas de connexion tenue, tout reste
--    comme avant la migration.
-- 2. Les connexions : une ligne par joueur et par monde, lisible par lui seul,
--    écrite par les fonctions ci-dessous. Elle survit à un rechargement.
-- 3. Les messages système (`system`) : 'join' (« Rejoindre »), 'leave'
--    (« Quitter »), 'idle' (inactivité), dans la salle principale. Seule la
--    base en écrit ; ils ne comptent pas dans la limite d'un message par
--    seconde.
-- 4. À l'envoi : il faut être connecté, et le message vaut activité.
-- 5. Les fonctions du client : état, rejoindre, quitter, activité (frappe).
-- 6. La déconnexion des inactifs, chaque minute (pg_cron) : aussi ceux qui
--    ont fermé l'onglet.
-- 7. Couper la connexion tenue (retour à 'auto' sans délai) efface les
--    connexions du monde, sans message.

-- ── 1. Réglages du monde ─────────────────────────────────────
ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS live_chat_join_mode    text    NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS live_chat_idle_minutes integer,
  ADD COLUMN IF NOT EXISTS live_chat_offline_view text    NOT NULL DEFAULT 'none';
ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_live_chat_join_mode_check;
ALTER TABLE public.worlds
  ADD CONSTRAINT worlds_live_chat_join_mode_check CHECK (live_chat_join_mode IN ('auto', 'button'));
ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_live_chat_idle_minutes_range;
ALTER TABLE public.worlds
  ADD CONSTRAINT worlds_live_chat_idle_minutes_range
  CHECK (live_chat_idle_minutes IS NULL OR live_chat_idle_minutes BETWEEN 1 AND 1440);
ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_live_chat_offline_view_check;
ALTER TABLE public.worlds
  ADD CONSTRAINT worlds_live_chat_offline_view_check CHECK (live_chat_offline_view IN ('none', 'read'));

-- La connexion est-elle tenue dans ce monde ?
CREATE OR REPLACE FUNCTION public.live_chat_sessions_on(p_world uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT w.live_chat_join_mode = 'button' OR w.live_chat_idle_minutes IS NOT NULL
      FROM public.worlds w WHERE w.id = p_world
  ), false);
$$;
REVOKE ALL ON FUNCTION public.live_chat_sessions_on(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Les connexions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_live_sessions (
  world_id       uuid        NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at      timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, user_id)
);
CREATE INDEX IF NOT EXISTS world_live_sessions_user_idx ON public.world_live_sessions (user_id);
ALTER TABLE public.world_live_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS world_live_sessions_select ON public.world_live_sessions;
CREATE POLICY world_live_sessions_select ON public.world_live_sessions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.world_live_sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.world_live_sessions FROM authenticated;

-- ── 3. Les messages système ──────────────────────────────────
ALTER TABLE public.world_live_messages
  ADD COLUMN IF NOT EXISTS system text;
ALTER TABLE public.world_live_messages DROP CONSTRAINT IF EXISTS world_live_messages_system_check;
ALTER TABLE public.world_live_messages
  ADD CONSTRAINT world_live_messages_system_check CHECK (
    system IS NULL
    OR (system IN ('join', 'leave', 'idle')
        AND channel_id IS NULL AND chatroom_id IS NULL
        AND reply_to_id IS NULL AND persona_id IS NULL)
  );

-- Le client n'en écrit jamais : la politique d'ajout les refuse.
DROP POLICY IF EXISTS world_live_messages_insert ON public.world_live_messages;
CREATE POLICY world_live_messages_insert ON public.world_live_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND system IS NULL
    AND public.is_world_member(world_id, (SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = world_live_messages.world_id AND w.enable_live_chat)
    AND (chatroom_id IS NULL OR EXISTS (SELECT 1 FROM public.chatrooms r WHERE r.id = world_live_messages.chatroom_id))
    AND (channel_id IS NULL OR EXISTS (SELECT 1 FROM public.world_live_channels c WHERE c.id = world_live_messages.channel_id))
  );

-- La limite d'un message par seconde ne voit pas les messages système.
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
  IF NEW.system IS NULL AND EXISTS (
    SELECT 1 FROM public.world_live_messages m
     WHERE m.world_id = NEW.world_id
       AND m.user_id = NEW.user_id
       AND m.system IS NULL
       AND m.created_at > now() - interval '1 second'
  ) THEN
    RAISE EXCEPTION 'Trop de messages : patientez un instant.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_live_message_insert() FROM PUBLIC, anon, authenticated;

-- ── 4. À l'envoi : connecté, et c'est une activité ───────────
CREATE OR REPLACE FUNCTION public.tg_world_live_message_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_idle integer;
BEGIN
  IF NEW.system IS NOT NULL OR NOT public.live_chat_sessions_on(NEW.world_id) THEN
    RETURN NEW;
  END IF;
  SELECT w.live_chat_idle_minutes INTO v_idle FROM public.worlds w WHERE w.id = NEW.world_id;
  UPDATE public.world_live_sessions s
     SET last_active_at = now()
   WHERE s.world_id = NEW.world_id
     AND s.user_id = NEW.user_id
     AND (v_idle IS NULL OR s.last_active_at >= now() - make_interval(mins => v_idle));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rejoignez la chatbox pour écrire.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_live_message_session() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_world_live_message_session ON public.world_live_messages;
CREATE TRIGGER trg_world_live_message_session
  BEFORE INSERT ON public.world_live_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_live_message_session();

-- ── 6. Déconnexion des inactifs ──────────────────────────────
-- Tous les mondes (pg_cron), ou un joueur d'un monde (avant de lire ou de
-- toucher sa connexion). Le message n'est écrit que si la chatbox est
-- allumée et le joueur encore membre.
CREATE OR REPLACE FUNCTION public.expire_world_live_sessions(p_world uuid DEFAULT NULL, p_user uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH gone AS (
    DELETE FROM public.world_live_sessions s
     USING public.worlds w
     WHERE w.id = s.world_id
       AND (p_world IS NULL OR s.world_id = p_world)
       AND (p_user IS NULL OR s.user_id = p_user)
       AND w.live_chat_idle_minutes IS NOT NULL
       AND s.last_active_at < now() - make_interval(mins => w.live_chat_idle_minutes)
    RETURNING s.world_id, s.user_id, w.enable_live_chat
  ), announced AS (
    INSERT INTO public.world_live_messages (world_id, user_id, content, system)
    SELECT g.world_id, g.user_id, 'idle', 'idle'
      FROM gone g
     WHERE g.enable_live_chat AND public.is_world_member(g.world_id, g.user_id)
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM gone;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_world_live_sessions(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 5. Les fonctions du client ───────────────────────────────
-- Joindre et quitter écrivent un message : pas plus d'un toutes les trois
-- secondes par joueur.
CREATE OR REPLACE FUNCTION public.live_chat_system_too_fast(p_world uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.world_live_messages m
     WHERE m.world_id = p_world AND m.user_id = p_user
       AND m.system IN ('join', 'leave')
       AND m.created_at > now() - interval '3 seconds'
  );
$$;
REVOKE ALL ON FUNCTION public.live_chat_system_too_fast(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- L'état de sa connexion : la dernière activité, nulle si l'on n'est pas
-- connecté (ou si la connexion n'est pas tenue dans ce monde).
CREATE OR REPLACE FUNCTION public.world_live_chat_session(p_world uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_at  timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT public.is_world_member(p_world, v_uid) THEN
    RAISE EXCEPTION 'Accès refusé.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.expire_world_live_sessions(p_world, v_uid);
  SELECT s.last_active_at INTO v_at FROM public.world_live_sessions s
   WHERE s.world_id = p_world AND s.user_id = v_uid;
  RETURN v_at;
END;
$$;

-- Rejoindre. `p_announce` : un message d'arrivée ; toujours en mode
-- « Rejoindre », jamais pour une connexion déjà ouverte.
CREATE OR REPLACE FUNCTION public.join_world_live_chat(p_world uuid, p_announce boolean DEFAULT true)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_mode     text;
  v_enabled  boolean;
  v_at       timestamptz;
  v_inserted boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.is_world_member(p_world, v_uid) THEN
    RAISE EXCEPTION 'Accès refusé.' USING ERRCODE = '42501';
  END IF;
  SELECT w.live_chat_join_mode, w.enable_live_chat INTO v_mode, v_enabled
    FROM public.worlds w WHERE w.id = p_world;
  IF NOT coalesce(v_enabled, false) THEN
    RAISE EXCEPTION 'La chatbox est désactivée.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.live_chat_sessions_on(p_world) THEN
    RETURN NULL;
  END IF;
  -- Une connexion périmée part d'abord, avec son message.
  PERFORM public.expire_world_live_sessions(p_world, v_uid);
  IF NOT EXISTS (SELECT 1 FROM public.world_live_sessions s WHERE s.world_id = p_world AND s.user_id = v_uid)
     AND (p_announce OR v_mode = 'button')
     AND public.live_chat_system_too_fast(p_world, v_uid) THEN
    RAISE EXCEPTION 'Trop de messages : patientez un instant.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.world_live_sessions (world_id, user_id)
  VALUES (p_world, v_uid)
  ON CONFLICT (world_id, user_id) DO UPDATE SET last_active_at = now()
  RETURNING last_active_at, (xmax = 0) INTO v_at, v_inserted;
  IF v_inserted AND (p_announce OR v_mode = 'button') THEN
    INSERT INTO public.world_live_messages (world_id, user_id, content, system)
    VALUES (p_world, v_uid, 'join', 'join');
  END IF;
  RETURN v_at;
END;
$$;

-- Quitter : la connexion se ferme, avec son message.
CREATE OR REPLACE FUNCTION public.leave_world_live_chat(p_world uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_world_member(p_world, v_uid) THEN
    RAISE EXCEPTION 'Accès refusé.' USING ERRCODE = '42501';
  END IF;
  -- Périmée : c'est l'inactivité qui l'a fermée.
  PERFORM public.expire_world_live_sessions(p_world, v_uid);
  IF NOT EXISTS (SELECT 1 FROM public.world_live_sessions s WHERE s.world_id = p_world AND s.user_id = v_uid) THEN
    RETURN;
  END IF;
  IF public.live_chat_system_too_fast(p_world, v_uid) THEN
    RAISE EXCEPTION 'Trop de messages : patientez un instant.' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.world_live_sessions s WHERE s.world_id = p_world AND s.user_id = v_uid;
  IF EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world AND w.enable_live_chat) THEN
    INSERT INTO public.world_live_messages (world_id, user_id, content, system)
    VALUES (p_world, v_uid, 'leave', 'leave');
  END IF;
END;
$$;

-- Une activité sans message (la frappe) : repousse la déconnexion. Nulle si
-- l'on n'est pas (ou plus) connecté.
CREATE OR REPLACE FUNCTION public.touch_world_live_chat(p_world uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_at  timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT public.is_world_member(p_world, v_uid) THEN
    RAISE EXCEPTION 'Accès refusé.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.expire_world_live_sessions(p_world, v_uid);
  UPDATE public.world_live_sessions s SET last_active_at = now()
   WHERE s.world_id = p_world AND s.user_id = v_uid
  RETURNING s.last_active_at INTO v_at;
  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.world_live_chat_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_world_live_chat(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_world_live_chat(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_world_live_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.world_live_chat_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_world_live_chat(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_world_live_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_world_live_chat(uuid) TO authenticated;

-- ── 6 bis. Chaque minute ─────────────────────────────────────
SELECT cron.schedule('expire-live-chat-sessions', '* * * * *', 'SELECT public.expire_world_live_sessions()');

-- ── 7. Connexion plus tenue : on efface ──────────────────────
CREATE OR REPLACE FUNCTION public.tg_world_live_sessions_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.live_chat_join_mode = 'auto' AND NEW.live_chat_idle_minutes IS NULL THEN
    DELETE FROM public.world_live_sessions s WHERE s.world_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_live_sessions_off() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_world_live_sessions_off ON public.worlds;
CREATE TRIGGER trg_world_live_sessions_off
  AFTER UPDATE OF live_chat_join_mode, live_chat_idle_minutes ON public.worlds
  FOR EACH ROW
  WHEN (OLD.live_chat_join_mode IS DISTINCT FROM NEW.live_chat_join_mode
        OR OLD.live_chat_idle_minutes IS DISTINCT FROM NEW.live_chat_idle_minutes)
  EXECUTE FUNCTION public.tg_world_live_sessions_off();
