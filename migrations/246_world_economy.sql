-- 246 — Économie, premier lot : la monnaie d'un monde et la bourse des personas.
--
-- Un monde a une seule monnaie, divisée en paliers (or, argent, cuivre…).
-- La base ne compte qu'en unité de base, la plus petite : un solde est un
-- entier, que l'interface décompose (lib/worldCurrency.ts). Chaque palier
-- vaut un nombre entier du suivant : 500 cuivres font 5 argents, sans reste.
--
-- 1. `worlds.enable_economy`, `worlds.currency_units` et leur contrôle.
-- 2. La permission `economy.manage` : créditer ou débiter un persona.
-- 3. `persona_wallets` : le solde de chaque persona, lu par les membres du
--    monde, écrit par les seules fonctions de la base.
-- 4. `world_economy_ledger` : chaque mouvement, lu par le joueur du persona
--    et par qui gère l'économie.
-- 5. `economy_apply` (interne) : le seul chemin d'écriture d'un solde.
-- 6. `adjust_persona_balance` : l'ajustement manuel, avec un motif.
-- 7. Le drapeau `world_economy`.

-- ── 1. ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_valid_currency_units(p_units jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry  jsonb;
  v_value  numeric;
  v_values bigint[] := '{}'::bigint[];
  i        integer;
BEGIN
  IF jsonb_typeof(p_units) IS DISTINCT FROM 'array'
     OR NOT (jsonb_array_length(p_units) BETWEEN 1 AND 5) THEN
    RETURN false;
  END IF;

  FOR v_entry IN SELECT e FROM jsonb_array_elements(p_units) AS e LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('name', 'short', 'value'))
       OR jsonb_typeof(v_entry->'name') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_entry->'short') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_entry->'value') IS DISTINCT FROM 'number' THEN
      RETURN false;
    END IF;
    IF NOT (char_length(btrim(v_entry->>'name')) BETWEEN 1 AND 30)
       OR char_length(btrim(v_entry->>'short')) > 6 THEN
      RETURN false;
    END IF;
    v_value := (v_entry->>'value')::numeric;
    IF v_value <> trunc(v_value) OR NOT (v_value BETWEEN 1 AND 1000000000000) THEN
      RETURN false;
    END IF;
    v_values := v_values || v_value::bigint;
  END LOOP;

  SELECT array_agg(v ORDER BY v DESC) INTO v_values FROM unnest(v_values) AS v;
  IF v_values[array_length(v_values, 1)] <> 1 THEN
    RETURN false;
  END IF;
  FOR i IN 1 .. array_length(v_values, 1) - 1 LOOP
    IF v_values[i] = v_values[i + 1] OR v_values[i] % v_values[i + 1] <> 0 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS enable_economy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS currency_units jsonb NOT NULL DEFAULT '[{"name": "Pièce", "short": "", "value": 1}]'::jsonb;

ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_currency_units_check;
ALTER TABLE public.worlds
  ADD CONSTRAINT worlds_currency_units_check CHECK (public.is_valid_currency_units(currency_units));

-- ── 2. ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.world_permission_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    -- Général
    'administrator', 'world.settings', 'roles.manage', 'members.manage', 'members.announce',
    -- Salons
    'messages.post', 'chatrooms.create', 'chatrooms.manage', 'chatrooms.link', 'categories.manage',
    -- Contenu
    'wiki.edit', 'wiki.comment', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit', 'timeline.manage', 'economy.manage',
    -- Personas
    'relations.manage', 'personas.review', 'npc.manage', 'npc.play',
    -- Mentions
    'mentions.roles', 'mentions.everyone'
  ]::text[];
$$;

-- ── 3. ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.persona_wallets (
  persona_id uuid PRIMARY KEY REFERENCES public.personas(id) ON DELETE CASCADE,
  world_id   uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  balance    bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persona_wallets_balance_check CHECK (balance BETWEEN 0 AND 1000000000000000)
);
CREATE INDEX IF NOT EXISTS persona_wallets_world_idx ON public.persona_wallets (world_id);

ALTER TABLE public.persona_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS persona_wallets_select ON public.persona_wallets;
CREATE POLICY persona_wallets_select ON public.persona_wallets
  FOR SELECT TO authenticated
  USING (public.is_world_member(world_id, (SELECT auth.uid())));

-- ── 4. ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_economy_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id      uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  persona_id    uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  delta         bigint NOT NULL,
  balance_after bigint NOT NULL,
  kind          text NOT NULL,
  note          text,
  actor_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_economy_ledger_kind_check CHECK (kind IN ('adjust')),
  CONSTRAINT world_economy_ledger_delta_check CHECK (delta <> 0)
);
ALTER TABLE public.world_economy_ledger DROP CONSTRAINT IF EXISTS world_economy_ledger_note_length;
ALTER TABLE public.world_economy_ledger
  ADD CONSTRAINT world_economy_ledger_note_length CHECK (char_length(note) <= 200);
CREATE INDEX IF NOT EXISTS world_economy_ledger_persona_idx
  ON public.world_economy_ledger (persona_id, created_at DESC);
CREATE INDEX IF NOT EXISTS world_economy_ledger_world_idx
  ON public.world_economy_ledger (world_id, created_at DESC);
CREATE INDEX IF NOT EXISTS world_economy_ledger_actor_idx
  ON public.world_economy_ledger (actor_id);

ALTER TABLE public.world_economy_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS world_economy_ledger_select ON public.world_economy_ledger;
CREATE POLICY world_economy_ledger_select ON public.world_economy_ledger
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.personas p
       WHERE p.id = world_economy_ledger.persona_id
         AND p.user_id = (SELECT auth.uid())
    )
    OR public.has_world_permission(world_id, (SELECT auth.uid()), 'economy.manage')
  );

-- ── 5. ───────────────────────────────────────────────────────
-- Le seul chemin d'écriture d'un solde : verrouille la bourse, refuse un
-- solde négatif, journalise. Appelée par les fonctions publiques, qui
-- vérifient chacune leurs droits.
CREATE OR REPLACE FUNCTION public.economy_apply(
  p_persona uuid,
  p_delta   bigint,
  p_kind    text,
  p_note    text,
  p_actor   uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_world   uuid;
  v_balance bigint;
BEGIN
  SELECT p.world_id INTO v_world
    FROM public.personas p
   WHERE p.id = p_persona AND p.deleted_at IS NULL AND NOT p.is_template;
  IF v_world IS NULL THEN
    RAISE EXCEPTION 'Persona introuvable.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.persona_wallets (persona_id, world_id)
  VALUES (p_persona, v_world)
  ON CONFLICT (persona_id) DO NOTHING;

  SELECT w.balance INTO v_balance
    FROM public.persona_wallets w
   WHERE w.persona_id = p_persona
     FOR UPDATE;

  v_balance := v_balance + p_delta;
  IF v_balance < 0 THEN
    RAISE EXCEPTION 'Solde insuffisant.' USING ERRCODE = '23514';
  END IF;
  IF v_balance > 1000000000000000 THEN
    RAISE EXCEPTION 'Solde trop élevé.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.persona_wallets
     SET balance = v_balance, updated_at = now()
   WHERE persona_id = p_persona;

  INSERT INTO public.world_economy_ledger (world_id, persona_id, delta, balance_after, kind, note, actor_id)
  VALUES (v_world, p_persona, p_delta, v_balance, p_kind, p_note, p_actor);

  RETURN v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.economy_apply(uuid, bigint, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ── 6. ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.adjust_persona_balance(
  p_persona uuid,
  p_delta   bigint,
  p_note    text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_world uuid;
  v_on    boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.' USING ERRCODE = '42501';
  END IF;

  SELECT p.world_id, w.enable_economy INTO v_world, v_on
    FROM public.personas p
    JOIN public.worlds w ON w.id = p.world_id
   WHERE p.id = p_persona AND p.deleted_at IS NULL AND NOT p.is_template;
  IF v_world IS NULL THEN
    RAISE EXCEPTION 'Persona introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_world_permission(v_world, v_uid, 'economy.manage') THEN
    RAISE EXCEPTION 'Permission requise : gérer l''économie.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_on THEN
    RAISE EXCEPTION 'L''économie de ce monde est désactivée.' USING ERRCODE = '55000';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 OR abs(p_delta) > 1000000000000000 THEN
    RAISE EXCEPTION 'Montant invalide.' USING ERRCODE = '22023';
  END IF;

  RETURN public.economy_apply(p_persona, p_delta, 'adjust', nullif(btrim(left(p_note, 200)), ''), v_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_persona_balance(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_persona_balance(uuid, bigint, text) TO authenticated;

-- ── 7. ───────────────────────────────────────────────────────
INSERT INTO public.feature_flags (key, enabled, label, description)
VALUES (
  'world_economy',
  false,
  'Économie des mondes',
  'Monnaie propre à chaque monde, divisée en paliers, et bourse de chaque persona.'
)
ON CONFLICT (key) DO NOTHING;

-- Vérifications :
-- SELECT public.is_valid_currency_units('[{"name":"Or","short":"po","value":100},{"name":"Cuivre","short":"pc","value":1}]'); -- → true
-- SELECT public.is_valid_currency_units('[{"name":"Or","short":"","value":100}]');                                          -- → false
-- SELECT 'economy.manage' = ANY (public.world_permission_keys());                                                          -- → true
-- SELECT has_function_privilege('authenticated', 'public.economy_apply(uuid,bigint,text,text,uuid)', 'EXECUTE');            -- → false
