-- 261 — Gains négatifs.
--
-- Demande du 2026-11-25 : un gain peut retirer de la monnaie (un message qui
-- coûte, une connexion du jour qui prélève). Un montant négatif ne vide la
-- bourse que jusqu'à zéro : on retire ce qu'il y a, jamais de dette. Le
-- plafond du jour ne borne que ce qui est gagné, et ne compte que les gains
-- positifs ; le délai entre deux messages vaut dans les deux sens.

ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_gain_amounts;
ALTER TABLE public.worlds ADD CONSTRAINT worlds_gain_amounts CHECK (
  gain_message BETWEEN -1000000000000 AND 1000000000000
  AND gain_scene_joined BETWEEN -1000000000000 AND 1000000000000
  AND gain_scene_created BETWEEN -1000000000000 AND 1000000000000
  AND gain_scene_completed BETWEEN -1000000000000 AND 1000000000000
  AND gain_daily_login BETWEEN -1000000000000 AND 1000000000000
  AND gain_message_cooldown BETWEEN 0 AND 1440
  AND (gain_daily_cap IS NULL OR gain_daily_cap BETWEEN 0 AND 1000000000000)
);

-- Crédite (ou débite) `p_persona` du gain `p_kind` fixé par son monde. Rend
-- ce qui a été versé ou retiré (0 si rien).
CREATE OR REPLACE FUNCTION public.economy_gain(p_persona uuid, p_kind text, p_mark text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_world    uuid;
  w          public.worlds%ROWTYPE;
  v_amount   bigint;
  v_today    bigint;
  v_last     timestamptz;
  v_marked   integer;
  v_balance  bigint;
BEGIN
  SELECT p.world_id INTO v_world
    FROM public.personas p
   WHERE p.id = p_persona
     AND p.deleted_at IS NULL
     AND NOT p.is_template
     AND NOT COALESCE(p.is_npc, false);
  IF v_world IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO w FROM public.worlds WHERE id = v_world;
  IF NOT w.enable_economy THEN
    RETURN 0;
  END IF;

  v_amount := CASE p_kind
    WHEN 'message'         THEN w.gain_message
    WHEN 'scene_joined'    THEN w.gain_scene_joined
    WHEN 'scene_created'   THEN w.gain_scene_created
    WHEN 'scene_completed' THEN w.gain_scene_completed
    WHEN 'daily_login'     THEN w.gain_daily_login
    ELSE 0
  END;
  IF v_amount = 0 THEN
    RETURN 0;
  END IF;

  -- Le délai entre deux messages payés (ou facturés).
  IF p_kind = 'message' AND w.gain_message_cooldown > 0 THEN
    SELECT max(l.created_at) INTO v_last
      FROM public.world_economy_ledger l
     WHERE l.persona_id = p_persona
       AND l.kind = 'gain_message'
       AND l.created_at > now() - make_interval(mins => w.gain_message_cooldown);
    IF v_last IS NOT NULL THEN
      RETURN 0;
    END IF;
  END IF;

  -- Le plafond du jour (UTC) : ce qui reste à gagner. Une perte n'y entre pas.
  IF v_amount > 0 AND w.gain_daily_cap IS NOT NULL THEN
    SELECT COALESCE(sum(GREATEST(l.delta, 0)), 0) INTO v_today
      FROM public.world_economy_ledger l
     WHERE l.persona_id = p_persona
       AND l.kind LIKE 'gain\_%'
       AND l.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    v_amount := LEAST(v_amount, w.gain_daily_cap - v_today);
    IF v_amount <= 0 THEN
      RETURN 0;
    END IF;
  END IF;

  -- Une perte : ce que la bourse contient, pas plus.
  IF v_amount < 0 THEN
    SELECT wl.balance INTO v_balance
      FROM public.persona_wallets wl
     WHERE wl.persona_id = p_persona
       FOR UPDATE;
    v_balance := COALESCE(v_balance, 0);
    v_amount := GREATEST(v_amount, -v_balance);
    IF v_amount = 0 THEN
      RETURN 0;
    END IF;
  END IF;

  -- La marque : un événement déjà compté ne l'est pas deux fois.
  IF p_mark IS NOT NULL THEN
    INSERT INTO public.world_gain_marks (key, world_id) VALUES (p_mark, v_world)
    ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_marked = ROW_COUNT;
    IF v_marked = 0 THEN
      RETURN 0;
    END IF;
  END IF;

  PERFORM public.economy_apply(p_persona, v_amount, 'gain_' || p_kind, NULL, NULL);
  RETURN v_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.economy_gain(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Un message en jeu : la scène rejointe, la scène créée, le message. Sortie
-- immédiate tant que le monde ne fixe aucun de ces trois montants.
CREATE OR REPLACE FUNCTION public.tg_chat_message_gains()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_creator uuid;
BEGIN
  IF NEW.persona_id IS NULL OR NEW.world_id IS NULL OR NEW.visible_to IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.worlds w
     WHERE w.id = NEW.world_id
       AND w.enable_economy
       AND (w.gain_message <> 0 OR w.gain_scene_joined <> 0 OR w.gain_scene_created <> 0)
  ) THEN
    RETURN NULL;
  END IF;

  PERFORM public.economy_gain(NEW.persona_id, 'scene_joined', 'joined:' || NEW.chat_id || ':' || NEW.persona_id);

  SELECT c.created_by INTO v_creator FROM public.chatrooms c WHERE c.id = NEW.chat_id;
  IF v_creator IS NOT NULL AND v_creator = NEW.author_id THEN
    PERFORM public.economy_gain(NEW.persona_id, 'scene_created', 'created:' || NEW.chat_id);
  END IF;

  PERFORM public.economy_gain(NEW.persona_id, 'message', NULL);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_chat_message_gains (message %) : %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

-- Une scène terminée : chaque persona qui y a écrit.
CREATE OR REPLACE FUNCTION public.tg_chatroom_gains()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_persona uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' OR OLD.status = 'completed' OR NEW.world_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.worlds w WHERE w.id = NEW.world_id AND w.enable_economy AND w.gain_scene_completed <> 0
  ) THEN
    RETURN NULL;
  END IF;

  FOR v_persona IN
    SELECT a.persona_id FROM public.chatroom_persona_authors a WHERE a.chat_id = NEW.id
  LOOP
    PERFORM public.economy_gain(v_persona, 'scene_completed', 'completed:' || NEW.id || ':' || v_persona);
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_chatroom_gains (salon %) : %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_chat_message_gains() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_chatroom_gains() FROM PUBLIC, anon, authenticated;

-- La première visite du jour (UTC) : chacun de mes personas du monde reçoit
-- (ou paie) le montant du jour. Rend le total, négatif pour une perte, 0 si
-- déjà fait ou nul.
CREATE OR REPLACE FUNCTION public.claim_daily_gain(p_world uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_day     text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  v_persona uuid;
  v_total   bigint := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.worlds w
     WHERE w.id = p_world AND w.enable_economy AND w.gain_daily_login <> 0
  ) THEN
    RETURN 0;
  END IF;

  -- Les marques des jours passés ne servent plus.
  DELETE FROM public.world_gain_marks
   WHERE world_id = p_world AND key LIKE 'daily:%' AND created_at < now() - interval '2 days';

  FOR v_persona IN
    SELECT p.id FROM public.personas p
     WHERE p.world_id = p_world
       AND p.user_id = v_user
       AND p.deleted_at IS NULL
       AND NOT p.is_template
       AND NOT COALESCE(p.is_npc, false)
  LOOP
    v_total := v_total + public.economy_gain(v_persona, 'daily_login', 'daily:' || v_persona || ':' || v_day);
  END LOOP;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_daily_gain(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_gain(uuid) TO authenticated;
