-- 254 — Journal d'activité d'un monde.
--
-- Une ligne par événement : qui a fait quoi, à quel persona, pour combien.
-- Le journal est général (colonne `domain`) ; il ne suit pour l'instant que
-- l'économie. Les gains automatiques n'y entrent pas (ils restent dans le
-- journal des soldes), ni ce qu'un joueur modifie lui-même dans son
-- inventaire en mode libre ou catalogue.
--
-- 1. `world_activity` : écrite par la base seule, lue selon le domaine (la
--    permission qui le gère) et par le joueur des personas concernés. Les
--    noms sont figés : la trace survit au persona et à l'objet.
-- 2. `world_economy_ledger.activity_id` : les mouvements de solde d'un
--    événement (un échange en a deux) se rattachent à sa ligne.
-- 3. `log_world_activity` (interne) et `economy_apply`, qui reçoit l'événement.
-- 4. Les RPC de l'économie journalisent : ajustement d'argent, don ou retrait
--    d'objet, achat d'emplacements, achat, vente. L'échange, par un
--    déclencheur sur `world_transfers`.
-- 5. Reprise de l'historique.

-- ── 1. ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_activity (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id            uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  domain              text NOT NULL,
  kind                text NOT NULL,
  actor_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  persona_id          uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  persona_name        text,
  target_persona_id   uuid REFERENCES public.personas(id) ON DELETE SET NULL,
  target_persona_name text,
  -- En unité de base. Signé pour un ajustement ; positif sinon (prix payé,
  -- prix reçu, somme donnée).
  amount              bigint NOT NULL DEFAULT 0,
  -- Figés : [{catalog_item_id, name, icon, lucide_icon, image_url, quantity}] ;
  -- quantité signée pour un don ou un retrait d'objet.
  items               jsonb NOT NULL DEFAULT '[]'::jsonb,
  note                text,
  -- L'objet de l'événement : article de boutique, transfert…
  ref_id              uuid,
  -- Le reste, selon le genre : {shop_name}, {slots}, {chat_id}.
  data                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_activity_domain_check CHECK (domain IN ('economy')),
  CONSTRAINT world_activity_kind_check CHECK (kind IN (
    'balance_adjust', 'item_adjust', 'slots_purchase', 'purchase', 'sale', 'transfer'
  )),
  CONSTRAINT world_activity_items_check CHECK (jsonb_typeof(items) = 'array'),
  CONSTRAINT world_activity_data_check CHECK (jsonb_typeof(data) = 'object')
);
ALTER TABLE public.world_activity DROP CONSTRAINT IF EXISTS world_activity_note_length;
ALTER TABLE public.world_activity
  ADD CONSTRAINT world_activity_note_length CHECK (char_length(note) <= 200);
CREATE INDEX IF NOT EXISTS world_activity_world_idx
  ON public.world_activity (world_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS world_activity_persona_idx ON public.world_activity (persona_id);
CREATE INDEX IF NOT EXISTS world_activity_target_idx ON public.world_activity (target_persona_id);
CREATE INDEX IF NOT EXISTS world_activity_actor_idx ON public.world_activity (actor_id);

-- La permission qui ouvre un domaine du journal.
CREATE OR REPLACE FUNCTION public.world_activity_permission(p_domain text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_domain WHEN 'economy' THEN 'economy.manage' END;
$$;

ALTER TABLE public.world_activity ENABLE ROW LEVEL SECURITY;

-- Lecture : qui gère le domaine (administrateurs compris), et le joueur d'un
-- persona concerné. Écriture : la base seule (aucune policy).
DROP POLICY IF EXISTS world_activity_select ON public.world_activity;
CREATE POLICY world_activity_select ON public.world_activity
  FOR SELECT TO authenticated
  USING (
    public.has_world_permission(world_id, (SELECT auth.uid()), public.world_activity_permission(domain))
    OR EXISTS (
      SELECT 1 FROM public.personas p
       WHERE p.id IN (world_activity.persona_id, world_activity.target_persona_id)
         AND p.user_id = (SELECT auth.uid())
    )
  );

-- ── 2. ───────────────────────────────────────────────────────
ALTER TABLE public.world_economy_ledger
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.world_activity(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS world_economy_ledger_activity_idx
  ON public.world_economy_ledger (activity_id);

-- ── 3. ───────────────────────────────────────────────────────
-- Inscrit un événement d'économie et rend son identifiant. Les noms des
-- personas sont lus ici, au moment de l'événement.
CREATE OR REPLACE FUNCTION public.log_world_activity(
  p_kind    text,
  p_actor   uuid,
  p_persona uuid,
  p_target  uuid DEFAULT NULL,
  p_amount  bigint DEFAULT 0,
  p_items   jsonb DEFAULT '[]'::jsonb,
  p_note    text DEFAULT NULL,
  p_ref     uuid DEFAULT NULL,
  p_data    jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_world uuid;
  v_name  text;
  v_tname text;
  v_id    uuid;
BEGIN
  SELECT p.world_id, p.name INTO v_world, v_name FROM public.personas p WHERE p.id = p_persona;
  IF v_world IS NULL THEN
    RAISE EXCEPTION 'Persona introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF p_target IS NOT NULL THEN
    SELECT p.name INTO v_tname FROM public.personas p WHERE p.id = p_target;
  END IF;
  INSERT INTO public.world_activity (
    world_id, domain, kind, actor_id, persona_id, persona_name, target_persona_id, target_persona_name,
    amount, items, note, ref_id, data
  )
  VALUES (
    v_world, 'economy', p_kind, p_actor, p_persona, v_name, p_target, v_tname,
    coalesce(p_amount, 0), coalesce(p_items, '[]'::jsonb), left(p_note, 200), p_ref, coalesce(p_data, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.log_world_activity(text, uuid, uuid, uuid, bigint, jsonb, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

-- L'objet du catalogue tel qu'il figure dans `items`.
CREATE OR REPLACE FUNCTION public.activity_catalog_item(p_item uuid, p_quantity integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_array(jsonb_build_object(
    'catalog_item_id', c.id, 'name', c.name, 'icon', c.icon,
    'lucide_icon', c.lucide_icon, 'image_url', c.image_url, 'quantity', p_quantity
  ))
    FROM public.world_catalog_items c
   WHERE c.id = p_item;
$$;
REVOKE ALL ON FUNCTION public.activity_catalog_item(uuid, integer) FROM PUBLIC, anon, authenticated;

-- `economy_apply` reçoit l'événement auquel rattacher le mouvement.
DROP FUNCTION IF EXISTS public.economy_apply(uuid, bigint, text, text, uuid);
CREATE OR REPLACE FUNCTION public.economy_apply(
  p_persona  uuid,
  p_delta    bigint,
  p_kind     text,
  p_note     text,
  p_actor    uuid,
  p_activity uuid DEFAULT NULL
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

  INSERT INTO public.world_economy_ledger (world_id, persona_id, delta, balance_after, kind, note, actor_id, activity_id)
  VALUES (v_world, p_persona, p_delta, v_balance, p_kind, p_note, p_actor, p_activity);

  RETURN v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.economy_apply(uuid, bigint, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. ───────────────────────────────────────────────────────
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
  v_note  text := nullif(btrim(left(p_note, 200)), '');
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

  RETURN public.economy_apply(
    p_persona, p_delta, 'adjust', v_note, v_uid,
    public.log_world_activity('balance_adjust', v_uid, p_persona, NULL, p_delta, '[]'::jsonb, v_note)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_persona_item(p_persona uuid, p_item uuid, p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_world uuid;
  v_on    boolean;
  v_qty   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.' USING ERRCODE = '42501';
  END IF;
  SELECT p.world_id, w.enable_inventory INTO v_world, v_on
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
    RAISE EXCEPTION 'L''inventaire de ce monde est désactivé.' USING ERRCODE = '55000';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 OR abs(p_delta) > 1000000 THEN
    RAISE EXCEPTION 'Quantité invalide.' USING ERRCODE = '22023';
  END IF;

  SELECT i.quantity INTO v_qty
    FROM public.persona_items i
   WHERE i.persona_id = p_persona AND i.catalog_item_id = p_item
     FOR UPDATE;
  v_qty := coalesce(v_qty, 0) + p_delta;
  IF v_qty < 0 THEN
    RAISE EXCEPTION 'Quantité insuffisante.' USING ERRCODE = '23514';
  END IF;

  IF v_qty = 0 THEN
    DELETE FROM public.persona_items WHERE persona_id = p_persona AND catalog_item_id = p_item;
  ELSE
    INSERT INTO public.persona_items (persona_id, world_id, catalog_item_id, quantity, sort_index)
    VALUES (
      p_persona, v_world, p_item, v_qty,
      coalesce((SELECT max(sort_index) + 1 FROM public.persona_items WHERE persona_id = p_persona), 0)
    )
    ON CONFLICT (persona_id, catalog_item_id) WHERE catalog_item_id IS NOT NULL
    DO UPDATE SET quantity = EXCLUDED.quantity;
  END IF;

  PERFORM public.log_world_activity(
    'item_adjust', v_uid, p_persona, NULL, 0,
    coalesce(public.activity_catalog_item(p_item, p_delta), '[]'::jsonb), NULL, p_item
  );
  RETURN v_qty;
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_persona_inventory(p_persona uuid, p_slots integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_world   public.worlds%ROWTYPE;
  v_owner   uuid;
  v_npc     boolean;
  v_extra   integer;
  v_cost    bigint;
  v_act     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.' USING ERRCODE = '42501';
  END IF;
  SELECT p.user_id, p.is_npc INTO v_owner, v_npc
    FROM public.personas p
   WHERE p.id = p_persona AND p.deleted_at IS NULL AND NOT p.is_template;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona introuvable.' USING ERRCODE = 'P0002';
  END IF;
  SELECT w.* INTO v_world
    FROM public.worlds w
    JOIN public.personas p ON p.world_id = w.id
   WHERE p.id = p_persona;

  IF NOT (v_owner = v_uid OR (v_npc AND public.has_world_permission(v_world.id, v_uid, 'npc.manage'))) THEN
    RAISE EXCEPTION 'Seul le joueur du persona agrandit son inventaire.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_world.enable_economy OR NOT v_world.enable_inventory
     OR v_world.inventory_slot_cost IS NULL OR v_world.inventory_slots_default = 0 THEN
    RAISE EXCEPTION 'L''agrandissement de l''inventaire n''est pas proposé dans ce monde.' USING ERRCODE = '55000';
  END IF;
  IF p_slots IS NULL OR p_slots < 1 OR p_slots > 1000 THEN
    RAISE EXCEPTION 'Nombre d''emplacements invalide.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.persona_wallets (persona_id, world_id)
  VALUES (p_persona, v_world.id)
  ON CONFLICT (persona_id) DO NOTHING;
  SELECT b.extra_slots INTO v_extra FROM public.persona_wallets b WHERE b.persona_id = p_persona FOR UPDATE;

  IF v_world.inventory_slots_default + v_extra + p_slots > coalesce(v_world.inventory_slots_max, 1000) THEN
    RAISE EXCEPTION 'Plafond d''emplacements atteint.' USING ERRCODE = '23514';
  END IF;

  v_cost := v_world.inventory_slot_cost * p_slots;
  v_act := public.log_world_activity(
    'slots_purchase', v_uid, p_persona, NULL, v_cost, '[]'::jsonb, NULL, NULL,
    jsonb_build_object('slots', p_slots)
  );
  IF v_cost > 0 THEN
    PERFORM public.economy_apply(p_persona, -v_cost, 'slots', NULL, v_uid, v_act);
  END IF;
  UPDATE public.persona_wallets SET extra_slots = v_extra + p_slots WHERE persona_id = p_persona;
  RETURN v_extra + p_slots;
END;
$$;

CREATE OR REPLACE FUNCTION public.buy_shop_item(p_persona uuid, p_shop_item uuid, p_quantity integer DEFAULT 1)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_world   uuid;
  v_item    record;
  v_qty     integer;
  v_balance bigint;
  v_act     uuid;
BEGIN
  v_world := public.shop_persona_world(p_persona);
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000000 THEN
    RAISE EXCEPTION 'Quantité invalide.' USING ERRCODE = '22023';
  END IF;

  SELECT i.catalog_item_id, i.price, i.stock, s.name AS shop_name, c.name AS item_name
    INTO v_item
    FROM public.world_shop_items i
    JOIN public.world_shops s ON s.id = i.shop_id
    JOIN public.world_catalog_items c ON c.id = i.catalog_item_id
   WHERE i.id = p_shop_item AND s.world_id = v_world AND s.is_open AND c.deleted_at IS NULL
     FOR UPDATE OF i;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF v_item.stock IS NOT NULL AND v_item.stock < p_quantity THEN
    RAISE EXCEPTION 'Stock épuisé.' USING ERRCODE = '23514';
  END IF;

  v_act := public.log_world_activity(
    'purchase', auth.uid(), p_persona, NULL, v_item.price * p_quantity,
    coalesce(public.activity_catalog_item(v_item.catalog_item_id, p_quantity), '[]'::jsonb),
    NULL, p_shop_item, jsonb_build_object('shop_name', v_item.shop_name)
  );
  IF v_item.price > 0 THEN
    v_balance := public.economy_apply(
      p_persona, -(v_item.price * p_quantity), 'purchase',
      left(format('%s ×%s · %s', v_item.item_name, p_quantity, v_item.shop_name), 200),
      auth.uid(), v_act
    );
  ELSE
    v_balance := coalesce((SELECT b.balance FROM public.persona_wallets b WHERE b.persona_id = p_persona), 0);
  END IF;

  -- L'objet rejoint l'inventaire ; ses déclencheurs tiennent la quantité
  -- maximale et les emplacements, et annulent l'achat entier au besoin.
  SELECT pi.quantity INTO v_qty
    FROM public.persona_items pi
   WHERE pi.persona_id = p_persona AND pi.catalog_item_id = v_item.catalog_item_id
     FOR UPDATE;
  INSERT INTO public.persona_items (persona_id, world_id, catalog_item_id, quantity, sort_index)
  VALUES (
    p_persona, v_world, v_item.catalog_item_id, coalesce(v_qty, 0) + p_quantity,
    coalesce((SELECT max(sort_index) + 1 FROM public.persona_items WHERE persona_id = p_persona), 0)
  )
  ON CONFLICT (persona_id, catalog_item_id) WHERE catalog_item_id IS NOT NULL
  DO UPDATE SET quantity = EXCLUDED.quantity;

  IF v_item.stock IS NOT NULL THEN
    UPDATE public.world_shop_items SET stock = stock - p_quantity WHERE id = p_shop_item;
  END IF;
  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.sell_shop_item(p_persona uuid, p_shop_item uuid, p_quantity integer DEFAULT 1)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_world   uuid;
  v_item    record;
  v_qty     integer;
  v_balance bigint;
  v_act     uuid;
BEGIN
  v_world := public.shop_persona_world(p_persona);
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000000 THEN
    RAISE EXCEPTION 'Quantité invalide.' USING ERRCODE = '22023';
  END IF;

  SELECT i.catalog_item_id, i.stock, s.name AS shop_name, c.name AS item_name,
         CASE WHEN s.buyback_enabled
              THEN coalesce(i.buyback_price, floor(i.price * s.buyback_percent / 100.0)::bigint)
         END AS unit_price
    INTO v_item
    FROM public.world_shop_items i
    JOIN public.world_shops s ON s.id = i.shop_id
    JOIN public.world_catalog_items c ON c.id = i.catalog_item_id
   WHERE i.id = p_shop_item AND s.world_id = v_world AND s.is_open AND c.deleted_at IS NULL
     FOR UPDATE OF i;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF v_item.unit_price IS NULL THEN
    RAISE EXCEPTION 'Cette boutique ne rachète pas cet objet.' USING ERRCODE = '55000';
  END IF;

  SELECT pi.quantity INTO v_qty
    FROM public.persona_items pi
   WHERE pi.persona_id = p_persona AND pi.catalog_item_id = v_item.catalog_item_id
     FOR UPDATE;
  IF coalesce(v_qty, 0) < p_quantity THEN
    RAISE EXCEPTION 'Quantité insuffisante.' USING ERRCODE = '23514';
  END IF;
  IF v_qty = p_quantity THEN
    DELETE FROM public.persona_items WHERE persona_id = p_persona AND catalog_item_id = v_item.catalog_item_id;
  ELSE
    UPDATE public.persona_items SET quantity = v_qty - p_quantity
     WHERE persona_id = p_persona AND catalog_item_id = v_item.catalog_item_id;
  END IF;

  IF v_item.stock IS NOT NULL THEN
    UPDATE public.world_shop_items SET stock = least(stock + p_quantity, 1000000) WHERE id = p_shop_item;
  END IF;

  v_act := public.log_world_activity(
    'sale', auth.uid(), p_persona, NULL, v_item.unit_price * p_quantity,
    coalesce(public.activity_catalog_item(v_item.catalog_item_id, p_quantity), '[]'::jsonb),
    NULL, p_shop_item, jsonb_build_object('shop_name', v_item.shop_name)
  );
  IF v_item.unit_price > 0 THEN
    v_balance := public.economy_apply(
      p_persona, v_item.unit_price * p_quantity, 'sale',
      left(format('%s ×%s · %s', v_item.item_name, p_quantity, v_item.shop_name), 200),
      auth.uid(), v_act
    );
  ELSE
    v_balance := coalesce((SELECT b.balance FROM public.persona_wallets b WHERE b.persona_id = p_persona), 0);
  END IF;
  RETURN v_balance;
END;
$$;

-- L'échange : `transfer_to_persona` écrit sa ligne de `world_transfers` en
-- dernier ; le déclencheur l'inscrit au journal et y rattache les deux
-- mouvements de solde de la même transaction.
CREATE OR REPLACE FUNCTION public.tg_world_transfers_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_act uuid;
BEGIN
  v_act := public.log_world_activity(
    'transfer', NEW.actor_id, NEW.from_persona_id, NEW.to_persona_id, NEW.amount, NEW.items,
    NULL, NEW.id, CASE WHEN NEW.chat_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('chat_id', NEW.chat_id) END
  );
  UPDATE public.world_economy_ledger l
     SET activity_id = v_act
   WHERE l.kind = 'transfer'
     AND l.activity_id IS NULL
     AND l.persona_id IN (NEW.from_persona_id, NEW.to_persona_id)
     AND l.created_at = NEW.created_at;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_transfers_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS world_transfers_activity ON public.world_transfers;
CREATE TRIGGER world_transfers_activity
  AFTER INSERT ON public.world_transfers
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_transfers_activity();

-- ── 5. ───────────────────────────────────────────────────────
-- Les mouvements passés, hors gains et échanges : une ligne de journal par
-- mouvement, sous le même identifiant. Les objets d'un achat ou d'une vente
-- n'étaient pas notés : seul le motif (« Objet ×2 · Boutique ») les garde.
INSERT INTO public.world_activity (
  id, world_id, domain, kind, actor_id, persona_id, persona_name, amount, note, created_at
)
SELECT l.id, l.world_id, 'economy',
       CASE l.kind WHEN 'adjust' THEN 'balance_adjust' WHEN 'slots' THEN 'slots_purchase' ELSE l.kind END,
       l.actor_id, l.persona_id, p.name,
       CASE WHEN l.kind = 'adjust' THEN l.delta ELSE abs(l.delta) END,
       l.note, l.created_at
  FROM public.world_economy_ledger l
  LEFT JOIN public.personas p ON p.id = l.persona_id
 WHERE l.kind IN ('adjust', 'slots', 'purchase', 'sale')
   AND l.activity_id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE public.world_economy_ledger l
   SET activity_id = l.id
 WHERE l.kind IN ('adjust', 'slots', 'purchase', 'sale')
   AND l.activity_id IS NULL
   AND EXISTS (SELECT 1 FROM public.world_activity a WHERE a.id = l.id);

-- Les échanges passés, depuis leur trace.
INSERT INTO public.world_activity (
  id, world_id, domain, kind, actor_id, persona_id, persona_name, target_persona_id, target_persona_name,
  amount, items, ref_id, data, created_at
)
SELECT t.id, t.world_id, 'economy', 'transfer',
       (SELECT pr.id FROM public.profiles pr WHERE pr.id = t.actor_id),
       t.from_persona_id, pf.name, t.to_persona_id, pt.name,
       t.amount, t.items, t.id,
       CASE WHEN t.chat_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('chat_id', t.chat_id) END,
       t.created_at
  FROM public.world_transfers t
  LEFT JOIN public.personas pf ON pf.id = t.from_persona_id
  LEFT JOIN public.personas pt ON pt.id = t.to_persona_id
ON CONFLICT (id) DO NOTHING;

UPDATE public.world_economy_ledger l
   SET activity_id = t.id
  FROM public.world_transfers t
 WHERE l.kind = 'transfer'
   AND l.activity_id IS NULL
   AND l.persona_id IN (t.from_persona_id, t.to_persona_id)
   AND l.created_at = t.created_at;

-- Vérifications :
-- SELECT kind, count(*) FROM public.world_activity GROUP BY 1;
-- SELECT count(*) FROM public.world_economy_ledger WHERE kind NOT LIKE 'gain\_%' AND activity_id IS NULL;  -- → 0
-- SELECT has_function_privilege('authenticated', 'public.log_world_activity(text,uuid,uuid,uuid,bigint,jsonb,text,uuid,jsonb)', 'EXECUTE');  -- → false
-- SELECT has_function_privilege('authenticated', 'public.economy_apply(uuid,bigint,text,text,uuid,uuid)', 'EXECUTE');  -- → false
