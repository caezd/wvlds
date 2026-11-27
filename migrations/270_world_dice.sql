-- ============================================================
-- Migration 270 — Les dés d'un monde
-- ============================================================
-- Un monde définit ses dés (Paramètres › Jeu › Dés) : un nom, un minimum, un
-- maximum, et « masqué » (hors de la liste des joueurs, lancé par l'équipe).
-- Deux règles du monde :
--   dice_mode        'free'       : formules libres permises (comme avant) ;
--                    'predefined' : seuls les dés du monde se lancent.
--   dice_allow_edit  un lancer publié peut-il être modifié (sa description) ?
--
-- Le tirage passe par la base (`roll_dice`) : le texte d'un message est
-- chiffré dans le navigateur, la base ne peut donc ni lire ni contrôler un
-- résultat écrit dedans. Le lancer est une ligne de `dice_rolls`, que seule la
-- fonction écrit ; le message la désigne par `chat_messages.dice_roll_id` et
-- l'affichage lit le résultat dans cette ligne, jamais dans le texte.
-- Miroir des bornes : lib/worldDice.ts.

-- ── Règles du monde ─────────────────────────────────────────
ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS dice_mode text NOT NULL DEFAULT 'free'
    CONSTRAINT worlds_dice_mode_check CHECK (dice_mode IN ('free', 'predefined')),
  ADD COLUMN IF NOT EXISTS dice_allow_edit boolean NOT NULL DEFAULT false;

-- Liste blanche des colonnes (migration 258) : l'écriture reste soumise à la
-- policy de mise à jour des mondes (`world.settings`).
GRANT UPDATE (dice_mode, dice_allow_edit) ON public.worlds TO authenticated;

-- ── Les dés du monde ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_dice (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id   uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  name       text NOT NULL CONSTRAINT world_dice_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  min_value  integer NOT NULL CONSTRAINT world_dice_min_check CHECK (min_value BETWEEN -1000000 AND 1000000),
  max_value  integer NOT NULL CONSTRAINT world_dice_max_check CHECK (max_value BETWEEN -1000000 AND 1000000),
  hidden     boolean NOT NULL DEFAULT false,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_dice_range_check CHECK (min_value < max_value)
);

CREATE INDEX IF NOT EXISTS world_dice_world_idx ON public.world_dice (world_id, position);

ALTER TABLE public.world_dice ENABLE ROW LEVEL SECURITY;

-- Un membre voit les dés du monde ; un dé masqué, seulement l'équipe.
DROP POLICY IF EXISTS world_dice_select ON public.world_dice;
CREATE POLICY world_dice_select ON public.world_dice FOR SELECT TO authenticated
  USING (
    public.is_world_member(world_id, (SELECT auth.uid()))
    AND (NOT hidden OR public.has_world_permission(world_id, (SELECT auth.uid()), 'world.settings'))
  );

DROP POLICY IF EXISTS world_dice_insert ON public.world_dice;
CREATE POLICY world_dice_insert ON public.world_dice FOR INSERT TO authenticated
  WITH CHECK (public.has_world_permission(world_id, (SELECT auth.uid()), 'world.settings'));

DROP POLICY IF EXISTS world_dice_update ON public.world_dice;
CREATE POLICY world_dice_update ON public.world_dice FOR UPDATE TO authenticated
  USING (public.has_world_permission(world_id, (SELECT auth.uid()), 'world.settings'))
  WITH CHECK (public.has_world_permission(world_id, (SELECT auth.uid()), 'world.settings'));

DROP POLICY IF EXISTS world_dice_delete ON public.world_dice;
CREATE POLICY world_dice_delete ON public.world_dice FOR DELETE TO authenticated
  USING (public.has_world_permission(world_id, (SELECT auth.uid()), 'world.settings'));

REVOKE ALL ON public.world_dice FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.world_dice TO authenticated;
-- Un dé ne change pas de monde.
GRANT UPDATE (name, min_value, max_value, hidden, position) ON public.world_dice TO authenticated;

-- Cinquante dés par monde.
CREATE OR REPLACE FUNCTION public.tg_world_dice_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('world_dice:' || NEW.world_id::text));
  IF (SELECT count(*) FROM public.world_dice WHERE world_id = NEW.world_id) >= 50 THEN
    RAISE EXCEPTION 'world_dice_limit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_world_dice_limit ON public.world_dice;
CREATE TRIGGER trg_world_dice_limit
  BEFORE INSERT ON public.world_dice
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_dice_limit();

-- ── Les lancers ─────────────────────────────────────────────
-- Écrits par `roll_dice` seulement. Le nom et la plage du dé y sont copiés :
-- un dé modifié ou supprimé ne change pas un lancer passé.
-- `die_name` NULL : une formule libre (`count`d`max_value`).
CREATE TABLE IF NOT EXISTS public.dice_rolls (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id   uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  chat_id    uuid NOT NULL REFERENCES public.chatrooms(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  die_id     uuid REFERENCES public.world_dice(id) ON DELETE SET NULL,
  die_name   text,
  min_value  integer NOT NULL,
  max_value  integer NOT NULL,
  count      integer NOT NULL CONSTRAINT dice_rolls_count_check CHECK (count BETWEEN 1 AND 100),
  modifier   integer NOT NULL DEFAULT 0 CONSTRAINT dice_rolls_modifier_check CHECK (modifier BETWEEN -1000000 AND 1000000),
  results    integer[] NOT NULL,
  total      bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dice_rolls_chat_idx ON public.dice_rolls (chat_id);

ALTER TABLE public.dice_rolls ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS dice_roll_id uuid REFERENCES public.dice_rolls(id) ON DELETE SET NULL;

-- Un lancer ne sert qu'à un message.
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_dice_roll_idx
  ON public.chat_messages (dice_roll_id) WHERE dice_roll_id IS NOT NULL;

-- Un lancer se lit comme le message qui le publie (salon lisible, note privée
-- comprise : la policy de chat_messages s'applique dans la sous-requête) ;
-- son auteur le lit aussi avant de l'avoir publié.
DROP POLICY IF EXISTS dice_rolls_select ON public.dice_rolls;
CREATE POLICY dice_rolls_select ON public.dice_rolls FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.dice_roll_id = dice_rolls.id)
  );

REVOKE ALL ON public.dice_rolls FROM anon, authenticated;
GRANT SELECT ON public.dice_rolls TO authenticated;

-- ── Le tirage ───────────────────────────────────────────────
-- Un dé du monde (`p_die`) ou, si le monde le permet, une formule libre
-- (`p_faces` faces, de 1 à p_faces). Rend la ligne du lancer.
CREATE OR REPLACE FUNCTION public.roll_dice(
  p_chat     uuid,
  p_die      uuid DEFAULT NULL,
  p_count    integer DEFAULT 1,
  p_modifier integer DEFAULT 0,
  p_faces    integer DEFAULT NULL
)
RETURNS public.dice_rolls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_world   uuid;
  v_mode    text;
  v_die     public.world_dice;
  v_name    text;
  v_min     integer;
  v_max     integer;
  v_results integer[];
  v_row     public.dice_rolls;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT c.world_id INTO v_world FROM public.chatrooms c WHERE c.id = p_chat;
  IF v_world IS NULL
     OR NOT public.can_read_chatroom(p_chat, v_uid)
     OR NOT public.has_world_permission(v_world, v_uid, 'messages.post') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF p_count IS NULL OR p_count NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'dice_invalid_count' USING ERRCODE = '22023';
  END IF;
  IF p_modifier IS NULL OR p_modifier NOT BETWEEN -1000000 AND 1000000 THEN
    RAISE EXCEPTION 'dice_invalid_modifier' USING ERRCODE = '22023';
  END IF;

  SELECT w.dice_mode INTO v_mode FROM public.worlds w WHERE w.id = v_world;

  IF p_die IS NOT NULL THEN
    SELECT * INTO v_die FROM public.world_dice d WHERE d.id = p_die AND d.world_id = v_world;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'dice_not_found' USING ERRCODE = 'P0002';
    END IF;
    IF v_die.hidden AND NOT public.has_world_permission(v_world, v_uid, 'world.settings') THEN
      RAISE EXCEPTION 'dice_hidden' USING ERRCODE = '42501';
    END IF;
    v_name := v_die.name;
    v_min := v_die.min_value;
    v_max := v_die.max_value;
  ELSE
    IF v_mode = 'predefined' THEN
      RAISE EXCEPTION 'dice_predefined_only' USING ERRCODE = '42501';
    END IF;
    IF p_faces IS NULL OR p_faces NOT BETWEEN 2 AND 1000 THEN
      RAISE EXCEPTION 'dice_invalid_faces' USING ERRCODE = '22023';
    END IF;
    v_min := 1;
    v_max := p_faces;
  END IF;

  SELECT array_agg(v_min + floor(random() * ((v_max::bigint - v_min) + 1))::integer)
    INTO v_results
    FROM generate_series(1, p_count);

  INSERT INTO public.dice_rolls (world_id, chat_id, user_id, die_id, die_name, min_value, max_value, count, modifier, results, total)
  VALUES (
    v_world, p_chat, v_uid, p_die, v_name, v_min, v_max, p_count, p_modifier, v_results,
    (SELECT coalesce(sum(r), 0) FROM unnest(v_results) AS r) + p_modifier
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.roll_dice(uuid, uuid, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roll_dice(uuid, uuid, integer, integer, integer) TO authenticated;

-- ── Le message d'un lancer ──────────────────────────────────
-- À l'insertion : le lancer appartient à l'auteur et au salon du message.
-- À la modification : le texte d'un lancer est figé, sauf si le monde le
-- permet (`dice_allow_edit`). Le résultat, lui, n'est jamais dans le texte.
CREATE OR REPLACE FUNCTION public.tg_chat_message_dice_roll()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_roll public.dice_rolls;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.dice_roll_id IS NOT NULL THEN
      SELECT * INTO v_roll FROM public.dice_rolls r WHERE r.id = NEW.dice_roll_id;
      IF NOT FOUND
         OR v_roll.user_id IS DISTINCT FROM auth.uid()
         OR v_roll.chat_id IS DISTINCT FROM NEW.chat_id THEN
        RAISE EXCEPTION 'dice_roll_mismatch' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.dice_roll_id IS NOT NULL
     AND NEW.content IS DISTINCT FROM OLD.content
     AND NOT coalesce((
       SELECT w.dice_allow_edit FROM public.chatrooms c JOIN public.worlds w ON w.id = c.world_id
        WHERE c.id = OLD.chat_id
     ), false) THEN
    RAISE EXCEPTION 'dice_roll_locked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_message_dice_roll ON public.chat_messages;
CREATE TRIGGER trg_chat_message_dice_roll
  BEFORE INSERT OR UPDATE OF content ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_chat_message_dice_roll();

-- Retour arrière :
-- DROP TRIGGER trg_chat_message_dice_roll ON public.chat_messages;
-- DROP FUNCTION public.tg_chat_message_dice_roll(), public.roll_dice(uuid, uuid, integer, integer, integer);
-- ALTER TABLE public.chat_messages DROP COLUMN dice_roll_id;
-- DROP TABLE public.dice_rolls, public.world_dice;
-- DROP FUNCTION public.tg_world_dice_limit();
-- ALTER TABLE public.worlds DROP COLUMN dice_mode, DROP COLUMN dice_allow_edit;
