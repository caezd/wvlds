-- ============================================================
-- Migration 272 — Les faces d'un dé en image
-- ============================================================
-- Chaque valeur d'un dé du monde peut porter une image (Paramètres › Jeu ›
-- Dés › Faces), et cacher son nombre sous elle. Le tirage ne change pas : la
-- valeur reste celle de la plage, l'image l'habille.
--
--   world_dice.faces  [{ value, image, hide_value? }] — une entrée par valeur
--                     habillée, dans la plage du dé ; 100 au plus.
--   dice_rolls.faces  les faces tirées, copiées par `roll_dice` : un dé
--                     modifié ou supprimé ne change pas un lancer passé.
--
-- Les images sont déposées sous `world-<id>/dice/` du bucket `worlds`, ouvert
-- à qui a `world.settings`. Miroir : `dieFacesSchema` (lib/worldDice.ts).

-- ── Contrôle ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_valid_die_faces(p_faces jsonb, p_min integer, p_max integer)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry  jsonb;
  v_value  numeric;
  v_values integer[] := '{}'::integer[];
BEGIN
  IF jsonb_typeof(p_faces) IS DISTINCT FROM 'array' OR jsonb_array_length(p_faces) > 100 THEN
    RETURN false;
  END IF;

  FOR v_entry IN SELECT e FROM jsonb_array_elements(p_faces) AS e LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('value', 'image', 'hide_value'))
       OR jsonb_typeof(v_entry->'value') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_entry->'image') IS DISTINCT FROM 'string'
       OR NOT public.is_http_url(v_entry->>'image') THEN
      RETURN false;
    END IF;
    IF v_entry ? 'hide_value' AND jsonb_typeof(v_entry->'hide_value') IS DISTINCT FROM 'boolean' THEN
      RETURN false;
    END IF;
    v_value := (v_entry->>'value')::numeric;
    IF v_value <> trunc(v_value) OR v_value NOT BETWEEN p_min AND p_max OR v_value::integer = ANY (v_values) THEN
      RETURN false;
    END IF;
    v_values := v_values || v_value::integer;
  END LOOP;
  RETURN true;
END;
$$;

-- ── Les faces d'un dé ───────────────────────────────────────
ALTER TABLE public.world_dice
  ADD COLUMN IF NOT EXISTS faces jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.world_dice DROP CONSTRAINT IF EXISTS world_dice_faces_check;
ALTER TABLE public.world_dice
  ADD CONSTRAINT world_dice_faces_check CHECK (public.is_valid_die_faces(faces, min_value, max_value));

-- Écrite par la policy de mise à jour des dés (`world.settings`).
GRANT UPDATE (faces) ON public.world_dice TO authenticated;

-- Une plage resserrée laisse tomber les faces qui en sortent, plutôt que de
-- refuser le nouveau minimum ou maximum.
CREATE OR REPLACE FUNCTION public.tg_world_dice_faces_in_range()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF jsonb_typeof(NEW.faces) = 'array' THEN
    -- Une entrée mal formée reste : la contrainte la refusera.
    NEW.faces := coalesce((
      SELECT jsonb_agg(f ORDER BY o)
        FROM jsonb_array_elements(NEW.faces) WITH ORDINALITY AS e(f, o)
       WHERE CASE WHEN jsonb_typeof(f->'value') = 'number'
                  THEN (f->>'value')::numeric BETWEEN NEW.min_value AND NEW.max_value
                  ELSE true END
    ), '[]'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_world_dice_faces_in_range ON public.world_dice;
CREATE TRIGGER trg_world_dice_faces_in_range
  BEFORE INSERT OR UPDATE OF faces, min_value, max_value ON public.world_dice
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_dice_faces_in_range();

-- ── Les faces d'un lancer ───────────────────────────────────
ALTER TABLE public.dice_rolls
  ADD COLUMN IF NOT EXISTS faces jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Le tirage de la migration 270, qui copie en plus les faces tirées.
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
  v_faces   jsonb := '[]'::jsonb;
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

  -- Les faces tirées seulement, une fois chacune.
  IF p_die IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(f ORDER BY (f->>'value')::integer), '[]'::jsonb)
      INTO v_faces
      FROM jsonb_array_elements(v_die.faces) AS f
     WHERE (f->>'value')::integer = ANY (v_results);
  END IF;

  INSERT INTO public.dice_rolls (world_id, chat_id, user_id, die_id, die_name, min_value, max_value, count, modifier, results, total, faces)
  VALUES (
    v_world, p_chat, v_uid, p_die, v_name, v_min, v_max, p_count, p_modifier, v_results,
    (SELECT coalesce(sum(r), 0) FROM unnest(v_results) AS r) + p_modifier,
    v_faces
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.roll_dice(uuid, uuid, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roll_dice(uuid, uuid, integer, integer, integer) TO authenticated;

-- ── Le bucket `worlds` ───────────────────────────────────────
-- Les policies de la migration 265, plus le dossier `dice/`.
DROP POLICY IF EXISTS "worlds: world editors write" ON storage.objects;
DROP POLICY IF EXISTS "worlds: world editors delete" ON storage.objects;
CREATE POLICY "worlds: world editors write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'worlds'
  AND (
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(map|pin)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'map.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(item|category)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'catalog.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/currency/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'economy.manage'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/dice/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'world.settings'))
  )
);
CREATE POLICY "worlds: world editors delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'worlds'
  AND (
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(map|pin)-'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'map.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(item|category)-'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'catalog.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/currency/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'economy.manage'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/dice/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'world.settings'))
  )
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT public.is_valid_die_faces('[{"value":1,"image":"https://x/a.webp","hide_value":true}]', 1, 6);  -- true
-- SELECT public.is_valid_die_faces('[{"value":7,"image":"https://x/a.webp"}]', 1, 6);                     -- false
-- SELECT public.is_valid_die_faces('[{"value":1,"image":"javascript:alert(1)"}]', 1, 6);                -- false

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP TRIGGER trg_world_dice_faces_in_range ON public.world_dice;
-- DROP FUNCTION public.tg_world_dice_faces_in_range();
-- ALTER TABLE public.world_dice DROP CONSTRAINT world_dice_faces_check, DROP COLUMN faces;
-- ALTER TABLE public.dice_rolls DROP COLUMN faces;
-- DROP FUNCTION public.is_valid_die_faces(jsonb, integer, integer);
-- Puis réappliquer roll_dice de la migration 270 et les policies de la 265.
