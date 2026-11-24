-- 245 — Chatbox : la déconnexion pour inactivité ne vaut qu'avec « Rejoindre ».
--
-- Connecté dès l'arrivée dans le monde (`live_chat_join_mode = 'auto'`), la
-- connexion n'est plus tenue, même avec un délai d'inactivité enregistré : le
-- délai attend, grisé dans les réglages, qu'on repasse en « Rejoindre ».
--
-- 1. `live_chat_sessions_on` : le seul mode « Rejoindre ».
-- 2. La déconnexion des inactifs ne touche que les mondes en « Rejoindre ».
-- 3. Repasser en « dès l'arrivée » efface les connexions du monde, sans
--    message, même si un délai reste enregistré.
-- 4. Les connexions ouvertes en « dès l'arrivée » avec un délai (migration
--    244) n'ont plus lieu d'être : effacées, sans message.

-- ── 1. ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.live_chat_sessions_on(p_world uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT w.live_chat_join_mode = 'button' FROM public.worlds w WHERE w.id = p_world
  ), false);
$$;
REVOKE ALL ON FUNCTION public.live_chat_sessions_on(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. ───────────────────────────────────────────────────────
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
       AND w.live_chat_join_mode = 'button'
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

-- ── 3. ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_world_live_sessions_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.live_chat_join_mode = 'auto' THEN
    DELETE FROM public.world_live_sessions s WHERE s.world_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_live_sessions_off() FROM PUBLIC, anon, authenticated;

-- ── 4. ───────────────────────────────────────────────────────
DELETE FROM public.world_live_sessions s
 USING public.worlds w
 WHERE w.id = s.world_id AND w.live_chat_join_mode = 'auto';
