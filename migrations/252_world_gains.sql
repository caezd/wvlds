-- 252 — Économie, lot 5 : les gains automatiques.
--
-- La base crédite les personas quand ils jouent, selon les montants que le
-- monde a fixés (Paramètres › Fonctions › Économie › Gains) :
--   - un message en jeu (persona, visible de tous) ;
--   - une scène rejointe : la première apparition d'un persona dans un salon ;
--   - une scène créée : le premier message en persona du créateur du salon ;
--   - une scène terminée : chaque persona qui y a écrit, quand le salon passe
--     à « terminé » ;
--   - la première visite du jour : tous les personas du joueur dans le monde.
-- Anti-abus : un délai entre deux messages payés d'un même persona, et un
-- plafond de gains par persona et par jour (UTC).
--
-- 1. Options et montants du monde, coupés ou nuls par défaut.
-- 2. Le journal des soldes connaît les genres `gain_*`.
-- 3. `world_gain_marks` : ce qui a déjà été payé (une scène rejointe, créée,
--    terminée ; une visite du jour). Une marque par paiement : rejouer le
--    même événement ne paie pas deux fois.
-- 4. `economy_gain` (interne) : vérifie, plafonne, marque, crédite.
-- 5. Déclencheurs sur `chat_messages` et `chatrooms`. Un gain ne bloque
--    jamais un message ni un salon : toute erreur devient un avertissement.
-- 6. `claim_daily_gain` : appelé à la visite d'un monde.

-- ── 1. ───────────────────────────────────────────────────────
ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS enable_gains          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gain_message          bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gain_scene_joined     bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gain_scene_created    bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gain_scene_completed  bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gain_daily_login      bigint NOT NULL DEFAULT 0,
  -- Minutes entre deux messages payés d'un même persona ; 0 : aucun délai.
  ADD COLUMN IF NOT EXISTS gain_message_cooldown integer NOT NULL DEFAULT 0,
  -- Total des gains d'un persona par jour (UTC) ; NULL : sans plafond.
  ADD COLUMN IF NOT EXISTS gain_daily_cap        bigint;

ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_gain_amounts;
ALTER TABLE public.worlds ADD CONSTRAINT worlds_gain_amounts CHECK (
  gain_message BETWEEN 0 AND 1000000000000
  AND gain_scene_joined BETWEEN 0 AND 1000000000000
  AND gain_scene_created BETWEEN 0 AND 1000000000000
  AND gain_scene_completed BETWEEN 0 AND 1000000000000
  AND gain_daily_login BETWEEN 0 AND 1000000000000
  AND gain_message_cooldown BETWEEN 0 AND 1440
  AND (gain_daily_cap IS NULL OR gain_daily_cap BETWEEN 0 AND 1000000000000)
);

-- ── 2. ───────────────────────────────────────────────────────
ALTER TABLE public.world_economy_ledger DROP CONSTRAINT IF EXISTS world_economy_ledger_kind_check;
ALTER TABLE public.world_economy_ledger
  ADD CONSTRAINT world_economy_ledger_kind_check CHECK (kind IN ('adjust', 'slots', 'purchase', 'sale', 'transfer', 'gain_message', 'gain_scene_created', 'gain_scene_joined', 'gain_scene_completed', 'gain_daily_login'));

-- Le délai entre deux messages payés, le plafond du jour : lus à chaque message.
CREATE INDEX IF NOT EXISTS world_economy_ledger_gains_idx
  ON public.world_economy_ledger (persona_id, created_at DESC)
  WHERE kind LIKE 'gain\_%';

-- ── 3. ───────────────────────────────────────────────────────
-- Clés : `joined:<salon>:<persona>`, `created:<salon>`,
-- `completed:<salon>:<persona>`, `daily:<persona>:<AAAA-MM-JJ>`.
CREATE TABLE IF NOT EXISTS public.world_gain_marks (
  key        text PRIMARY KEY,
  world_id   uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS world_gain_marks_world_idx ON public.world_gain_marks (world_id, created_at);

-- Interne : ni lecture ni écriture hors des fonctions de la base.
ALTER TABLE public.world_gain_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.world_gain_marks FROM PUBLIC, anon, authenticated;

-- ── 4. ───────────────────────────────────────────────────────
-- Crédite `p_persona` du gain `p_kind` ('message', 'scene_joined'…) fixé par
-- son monde. `p_mark` : la marque qui rend le paiement unique (NULL pour un
-- message, que le délai tient). Rend ce qui a été crédité (0 si rien).
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
  IF NOT (w.enable_economy AND w.enable_gains) THEN
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
  IF v_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- Le délai entre deux messages payés.
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

  -- Le plafond du jour (UTC) : ce qui reste à gagner.
  IF w.gain_daily_cap IS NOT NULL THEN
    SELECT COALESCE(sum(l.delta), 0) INTO v_today
      FROM public.world_economy_ledger l
     WHERE l.persona_id = p_persona
       AND l.kind LIKE 'gain\_%'
       AND l.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
    v_amount := LEAST(v_amount, w.gain_daily_cap - v_today);
    IF v_amount <= 0 THEN
      RETURN 0;
    END IF;
  END IF;

  -- La marque : un événement déjà payé ne l'est pas deux fois.
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

-- ── 5. ───────────────────────────────────────────────────────
-- Un message en jeu : la scène rejointe, la scène créée, le message.
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
  -- Rien à lire tant que le monde n'a pas les gains.
  IF NOT EXISTS (
    SELECT 1 FROM public.worlds w WHERE w.id = NEW.world_id AND w.enable_economy AND w.enable_gains
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

DROP TRIGGER IF EXISTS trg_chat_message_gains ON public.chat_messages;
CREATE TRIGGER trg_chat_message_gains
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_chat_message_gains();

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
    SELECT 1 FROM public.worlds w WHERE w.id = NEW.world_id AND w.enable_economy AND w.enable_gains
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

DROP TRIGGER IF EXISTS trg_chatroom_gains ON public.chatrooms;
CREATE TRIGGER trg_chatroom_gains
  AFTER UPDATE OF status ON public.chatrooms
  FOR EACH ROW EXECUTE FUNCTION public.tg_chatroom_gains();

REVOKE ALL ON FUNCTION public.tg_chat_message_gains() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_chatroom_gains() FROM PUBLIC, anon, authenticated;

-- ── 6. ───────────────────────────────────────────────────────
-- La première visite du jour (UTC) : chacun de mes personas du monde reçoit
-- le gain quotidien. Rend le total crédité, 0 si déjà fait ou coupé.
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
     WHERE w.id = p_world AND w.enable_economy AND w.enable_gains AND w.gain_daily_login > 0
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
