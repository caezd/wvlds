-- 255 — Économie : la taxe des personas.
--
-- Un monde peut lever une taxe fixe sur chaque persona, à une récurrence
-- choisie (tous les N jours, semaines ou mois, à partir d'une date de
-- départ). Un persona qui n'a pas payé une période échue est « en défaut » :
-- un badge s'affiche à côté de son nom jusqu'à ce qu'il règle (ou que qui
-- gère l'économie annule sa dette).
--
-- Options du monde (Paramètres › Fonctions › Économie › Devises) :
--   - paiement manuel par le joueur, ou retrait automatique (la base prélève
--     dès que la bourse le permet) ;
--   - les dettes s'accumulent, ou seule la dernière période échue compte ;
--   - un nouveau persona ne doit rien avant la fin de sa première période.
--
-- 1. Réglages du monde.
-- 2. Genres : `tax` au journal des soldes, `tax_payment` et `tax_waive` au
--    journal d'activité.
-- 3. `persona_tax_dues` : une ligne par persona et par période. Lue par les
--    membres du monde (le badge est public), écrite par la base seule.
-- 4. `persona_tax_overdue` : les personas en défaut, pour le badge.
-- 5. `tax_period_bounds` (interne) : la période qui contient un instant.
-- 6. `tax_collect` (interne) : paie les dettes d'un persona, de la plus
--    ancienne à la plus récente, tant que la bourse suffit.
-- 7. `tax_assess_world` / `tax_assess_all` (internes) : crée les dettes de
--    la période en cours, fond les anciennes si elles ne s'accumulent pas,
--    prélève en mode automatique. Toutes les 10 minutes (pg_cron).
-- 8. RPC `pay_persona_tax` (le joueur) et `waive_persona_tax` (qui gère
--    l'économie).

-- ── 1. ───────────────────────────────────────────────────────
ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS tax_enabled     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_amount      bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_every       integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tax_unit        text NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS tax_anchor      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS tax_mode        text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS tax_accumulate  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tax_grace_new   boolean NOT NULL DEFAULT true,
  -- Le texte du badge ; NULL : celui de l'application (« Impayé »).
  ADD COLUMN IF NOT EXISTS tax_badge_label text;

ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_tax_settings;
ALTER TABLE public.worlds ADD CONSTRAINT worlds_tax_settings CHECK (
  tax_amount BETWEEN 0 AND 1000000000000
  AND tax_every BETWEEN 1 AND 365
  AND tax_unit IN ('day', 'week', 'month')
  AND tax_mode IN ('manual', 'auto')
  AND (tax_badge_label IS NULL OR char_length(tax_badge_label) BETWEEN 1 AND 24)
);

-- ── 2. ───────────────────────────────────────────────────────
ALTER TABLE public.world_economy_ledger DROP CONSTRAINT IF EXISTS world_economy_ledger_kind_check;
ALTER TABLE public.world_economy_ledger
  ADD CONSTRAINT world_economy_ledger_kind_check CHECK (kind IN ('adjust', 'slots', 'purchase', 'sale', 'transfer', 'gain_message', 'gain_scene_created', 'gain_scene_joined', 'gain_scene_completed', 'gain_daily_login', 'tax'));

ALTER TABLE public.world_activity DROP CONSTRAINT IF EXISTS world_activity_kind_check;
ALTER TABLE public.world_activity
  ADD CONSTRAINT world_activity_kind_check CHECK (kind IN ('balance_adjust', 'item_adjust', 'slots_purchase', 'purchase', 'sale', 'transfer', 'tax_payment', 'tax_waive'));

-- ── 3. ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.persona_tax_dues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id     uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  persona_id   uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end   timestamptz NOT NULL,
  amount       bigint NOT NULL CHECK (amount > 0),
  paid_at      timestamptz,
  -- Annulée : par qui gère l'économie (waived_by), ou fondue dans une
  -- période plus récente quand les dettes ne s'accumulent pas (superseded).
  waived_at    timestamptz,
  waived_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  superseded   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persona_tax_dues_period UNIQUE (persona_id, period_start),
  CONSTRAINT persona_tax_dues_bounds CHECK (period_end > period_start)
);
CREATE INDEX IF NOT EXISTS persona_tax_dues_unpaid_idx
  ON public.persona_tax_dues (world_id, persona_id, period_start)
  WHERE paid_at IS NULL AND waived_at IS NULL;
CREATE INDEX IF NOT EXISTS persona_tax_dues_waived_by_idx
  ON public.persona_tax_dues (waived_by) WHERE waived_by IS NOT NULL;

ALTER TABLE public.persona_tax_dues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.persona_tax_dues FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.persona_tax_dues TO authenticated;

DROP POLICY IF EXISTS persona_tax_dues_select ON public.persona_tax_dues;
CREATE POLICY persona_tax_dues_select ON public.persona_tax_dues
  FOR SELECT TO authenticated
  USING (public.is_world_member(world_id, (SELECT auth.uid())));

-- ── 4. ───────────────────────────────────────────────────────
-- Ceux qui ont une période échue non payée, dans un monde où la taxe est
-- active ; les droits de la table s'appliquent (security_invoker).
CREATE OR REPLACE VIEW public.persona_tax_overdue
WITH (security_invoker = true) AS
SELECT d.persona_id,
       d.world_id,
       count(*)::integer AS periods,
       sum(d.amount)     AS total,
       w.tax_badge_label AS badge_label
  FROM public.persona_tax_dues d
  JOIN public.worlds w ON w.id = d.world_id
 WHERE w.tax_enabled AND w.enable_economy
   AND d.paid_at IS NULL AND d.waived_at IS NULL
   AND d.period_end <= now()
 GROUP BY d.persona_id, d.world_id, w.tax_badge_label;

REVOKE ALL ON public.persona_tax_overdue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.persona_tax_overdue TO authenticated;

-- ── 5. ───────────────────────────────────────────────────────
-- La période qui contient `p_at`, comptée depuis `p_anchor` par pas de
-- `p_every` jours, semaines ou mois. NULL avant la date de départ.
CREATE OR REPLACE FUNCTION public.tax_period_bounds(
  p_anchor timestamptz,
  p_every  integer,
  p_unit   text,
  p_at     timestamptz,
  OUT period_start timestamptz,
  OUT period_end   timestamptz
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_months integer;
  v_k      integer;
  v_step   interval;
BEGIN
  IF p_at < p_anchor OR p_every < 1 THEN
    RETURN;
  END IF;
  IF p_unit = 'month' THEN
    v_months := (extract(year FROM age(p_at, p_anchor)) * 12 + extract(month FROM age(p_at, p_anchor)))::integer;
    v_k := v_months / p_every;
    -- Comptées depuis le départ, pas d'une période à l'autre : un 31 ne
    -- glisse pas vers le 28.
    period_start := p_anchor + make_interval(months => v_k * p_every);
    period_end   := p_anchor + make_interval(months => (v_k + 1) * p_every);
    RETURN;
  END IF;
  v_step := make_interval(days => CASE p_unit WHEN 'week' THEN 7 ELSE 1 END * p_every);
  v_k := floor(extract(epoch FROM p_at - p_anchor) / extract(epoch FROM v_step))::integer;
  period_start := p_anchor + v_step * v_k;
  period_end   := p_anchor + v_step * (v_k + 1);
END;
$$;
REVOKE ALL ON FUNCTION public.tax_period_bounds(timestamptz, integer, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- ── 6. ───────────────────────────────────────────────────────
-- Paie les dettes de `p_persona` (période en cours comprise), de la plus
-- ancienne à la plus récente, tant que la bourse suffit. `p_actor` : le
-- joueur, ou NULL pour le retrait automatique. Rend le nombre de périodes
-- payées.
CREATE OR REPLACE FUNCTION public.tax_collect(p_persona uuid, p_actor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance bigint;
  v_total   bigint := 0;
  v_ids     uuid[] := '{}';
  d         record;
BEGIN
  SELECT w.balance INTO v_balance
    FROM public.persona_wallets w
   WHERE w.persona_id = p_persona
     FOR UPDATE;
  v_balance := coalesce(v_balance, 0);

  FOR d IN
    SELECT t.id, t.amount
      FROM public.persona_tax_dues t
     WHERE t.persona_id = p_persona
       AND t.paid_at IS NULL AND t.waived_at IS NULL
       AND t.period_start <= now()
     ORDER BY t.period_start
       FOR UPDATE
  LOOP
    EXIT WHEN v_total + d.amount > v_balance;
    v_total := v_total + d.amount;
    v_ids := v_ids || d.id;
  END LOOP;

  IF cardinality(v_ids) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.persona_tax_dues SET paid_at = now() WHERE id = ANY (v_ids);
  PERFORM public.economy_apply(
    p_persona, -v_total, 'tax', NULL, p_actor,
    public.log_world_activity('tax_payment', p_actor, p_persona, NULL, v_total, '[]'::jsonb, NULL, NULL,
                              jsonb_build_object('periods', cardinality(v_ids)))
  );
  RETURN cardinality(v_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.tax_collect(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 7. ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tax_assess_world(p_world uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  w   public.worlds%ROWTYPE;
  v_s timestamptz;
  v_e timestamptz;
  r   record;
BEGIN
  SELECT * INTO w FROM public.worlds WHERE id = p_world;
  IF NOT FOUND OR NOT (w.enable_economy AND w.tax_enabled AND w.tax_amount > 0) THEN
    RETURN;
  END IF;
  SELECT b.period_start, b.period_end INTO v_s, v_e
    FROM public.tax_period_bounds(w.tax_anchor, w.tax_every, w.tax_unit, now()) b;
  IF v_s IS NULL THEN
    RETURN;
  END IF;

  -- La période en cours : chaque persona joueur du monde la doit. Avec la
  -- grâce, un persona créé après son début ne doit rien avant la suivante.
  INSERT INTO public.persona_tax_dues (world_id, persona_id, period_start, period_end, amount)
  SELECT w.id, p.id, v_s, v_e, w.tax_amount
    FROM public.personas p
   WHERE p.world_id = w.id
     AND p.deleted_at IS NULL
     AND NOT p.is_template
     AND NOT coalesce(p.is_npc, false)
     AND (NOT w.tax_grace_new OR p.created_at <= v_s)
  ON CONFLICT (persona_id, period_start) DO NOTHING;

  -- Sans accumulation : seule la dernière période échue reste due.
  IF NOT w.tax_accumulate THEN
    UPDATE public.persona_tax_dues d
       SET waived_at = now(), superseded = true
     WHERE d.world_id = w.id
       AND d.paid_at IS NULL AND d.waived_at IS NULL
       AND d.period_end <= now()
       AND EXISTS (
         SELECT 1 FROM public.persona_tax_dues n
          WHERE n.persona_id = d.persona_id
            AND n.paid_at IS NULL AND n.waived_at IS NULL
            AND n.period_end <= now()
            AND n.period_start > d.period_start
       );
  END IF;

  -- Retrait automatique : tout ce que la bourse permet.
  IF w.tax_mode = 'auto' THEN
    FOR r IN
      SELECT DISTINCT d.persona_id
        FROM public.persona_tax_dues d
       WHERE d.world_id = w.id AND d.paid_at IS NULL AND d.waived_at IS NULL
    LOOP
      PERFORM public.tax_collect(r.persona_id, NULL);
    END LOOP;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.tax_assess_world(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tax_assess_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.worlds WHERE tax_enabled AND enable_economy AND tax_amount > 0 LOOP
    BEGIN
      PERFORM public.tax_assess_world(r.id);
    EXCEPTION WHEN OTHERS THEN
      -- Un monde en erreur n'arrête pas les autres.
      RAISE WARNING 'tax_assess_world(%) : %', r.id, SQLERRM;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.tax_assess_all() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('assess-world-taxes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'assess-world-taxes');
SELECT cron.schedule('assess-world-taxes', '*/10 * * * *', 'SELECT public.tax_assess_all()');

-- ── 8. ───────────────────────────────────────────────────────
-- Le joueur paie ce que son persona doit. Rend le nombre de périodes payées.
CREATE OR REPLACE FUNCTION public.pay_persona_tax(p_persona uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_world uuid;
  v_owner uuid;
  v_on    boolean;
  v_paid  integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.' USING ERRCODE = '42501';
  END IF;
  SELECT p.world_id, p.user_id, (w.enable_economy AND w.tax_enabled)
    INTO v_world, v_owner, v_on
    FROM public.personas p
    JOIN public.worlds w ON w.id = p.world_id
   WHERE p.id = p_persona AND p.deleted_at IS NULL AND NOT p.is_template;
  IF v_world IS NULL THEN
    RAISE EXCEPTION 'Persona introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Seul le joueur du persona paie sa taxe.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_on THEN
    RAISE EXCEPTION 'La taxe de ce monde est désactivée.' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.persona_tax_dues
     WHERE persona_id = p_persona AND paid_at IS NULL AND waived_at IS NULL AND period_start <= now()
  ) THEN
    RAISE EXCEPTION 'Rien à payer.' USING ERRCODE = 'P0002';
  END IF;

  v_paid := public.tax_collect(p_persona, v_uid);
  IF v_paid = 0 THEN
    RAISE EXCEPTION 'Solde insuffisant.' USING ERRCODE = '23514';
  END IF;
  RETURN v_paid;
END;
$$;
REVOKE ALL ON FUNCTION public.pay_persona_tax(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_persona_tax(uuid) TO authenticated;

-- Qui gère l'économie annule les périodes échues d'un persona. Rend le
-- nombre de périodes annulées.
CREATE OR REPLACE FUNCTION public.waive_persona_tax(p_persona uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_world uuid;
  v_total bigint;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.' USING ERRCODE = '42501';
  END IF;
  SELECT p.world_id INTO v_world
    FROM public.personas p
   WHERE p.id = p_persona AND p.deleted_at IS NULL AND NOT p.is_template;
  IF v_world IS NULL THEN
    RAISE EXCEPTION 'Persona introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_world_permission(v_world, v_uid, 'economy.manage') THEN
    RAISE EXCEPTION 'Permission requise : gérer l''économie.' USING ERRCODE = '42501';
  END IF;

  WITH done AS (
    UPDATE public.persona_tax_dues
       SET waived_at = now(), waived_by = v_uid
     WHERE persona_id = p_persona
       AND paid_at IS NULL AND waived_at IS NULL
       AND period_end <= now()
    RETURNING amount
  )
  SELECT count(*), coalesce(sum(amount), 0) INTO v_count, v_total FROM done;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Aucune dette à annuler.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.log_world_activity('tax_waive', v_uid, p_persona, NULL, v_total, '[]'::jsonb, NULL, NULL,
                                    jsonb_build_object('periods', v_count));
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.waive_persona_tax(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.waive_persona_tax(uuid) TO authenticated;
