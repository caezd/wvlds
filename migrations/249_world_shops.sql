-- 249 — Économie, lot 3 : les boutiques d'un monde.
--
-- Un monde ouvre autant de boutiques qu'il veut (marchand, forge…). Chacune
-- vend des objets du catalogue, à un prix en monnaie du monde, avec un stock
-- facultatif (NULL : illimité). Si son option de revente est activée, elle
-- rachète ce qu'elle vend : au prix de rachat de l'article, à défaut à un
-- pourcentage de son prix ; l'objet revendu revient dans un stock limité.
--
-- 1. `world_shops`.
-- 2. `world_shop_items` et son contrôle (même monde, objet vivant du catalogue).
-- 3. RLS : chacun voit les boutiques ouvertes de ses mondes ; qui gère
--    l'économie voit tout et écrit tout. Une politique par action.
-- 4. Le journal des bourses gagne les achats et les reventes.
-- 5. `buy_shop_item`, `sell_shop_item` : le seul chemin d'un achat ou d'une
--    revente — solde, inventaire et stock dans la même transaction.

-- ── 1. ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_shops (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id        uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  lucide_icon     text,
  is_open         boolean NOT NULL DEFAULT true,
  buyback_enabled boolean NOT NULL DEFAULT false,
  buyback_percent integer,
  sort_index      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.world_shops DROP CONSTRAINT IF EXISTS world_shops_name_present;
ALTER TABLE public.world_shops
  ADD CONSTRAINT world_shops_name_present CHECK (btrim(name) <> '');
ALTER TABLE public.world_shops DROP CONSTRAINT IF EXISTS world_shops_name_length;
ALTER TABLE public.world_shops
  ADD CONSTRAINT world_shops_name_length CHECK (char_length(name) <= 80);
ALTER TABLE public.world_shops DROP CONSTRAINT IF EXISTS world_shops_description_length;
ALTER TABLE public.world_shops
  ADD CONSTRAINT world_shops_description_length CHECK (char_length(description) <= 1000);
ALTER TABLE public.world_shops DROP CONSTRAINT IF EXISTS world_shops_lucide_icon_length;
ALTER TABLE public.world_shops
  ADD CONSTRAINT world_shops_lucide_icon_length CHECK (char_length(lucide_icon) <= 64);
ALTER TABLE public.world_shops DROP CONSTRAINT IF EXISTS world_shops_buyback_percent_check;
ALTER TABLE public.world_shops
  ADD CONSTRAINT world_shops_buyback_percent_check CHECK (buyback_percent BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS world_shops_world_idx ON public.world_shops (world_id, sort_index);

-- ── 2. ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_shop_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid NOT NULL REFERENCES public.world_shops(id) ON DELETE CASCADE,
  -- Recopié de la boutique par le déclencheur : la RLS le lit sans jointure.
  world_id        uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES public.world_catalog_items(id) ON DELETE CASCADE,
  price           bigint NOT NULL DEFAULT 0,
  stock           integer,
  buyback_price   bigint,
  sort_index      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_shop_items_unique UNIQUE (shop_id, catalog_item_id)
);
ALTER TABLE public.world_shop_items DROP CONSTRAINT IF EXISTS world_shop_items_price_check;
ALTER TABLE public.world_shop_items
  ADD CONSTRAINT world_shop_items_price_check CHECK (price BETWEEN 0 AND 1000000000000);
ALTER TABLE public.world_shop_items DROP CONSTRAINT IF EXISTS world_shop_items_stock_check;
ALTER TABLE public.world_shop_items
  ADD CONSTRAINT world_shop_items_stock_check CHECK (stock BETWEEN 0 AND 1000000);
ALTER TABLE public.world_shop_items DROP CONSTRAINT IF EXISTS world_shop_items_buyback_check;
ALTER TABLE public.world_shop_items
  ADD CONSTRAINT world_shop_items_buyback_check CHECK (buyback_price BETWEEN 0 AND 1000000000000);

CREATE INDEX IF NOT EXISTS world_shop_items_shop_idx ON public.world_shop_items (shop_id, sort_index);
CREATE INDEX IF NOT EXISTS world_shop_items_world_idx ON public.world_shop_items (world_id);
CREATE INDEX IF NOT EXISTS world_shop_items_catalog_idx ON public.world_shop_items (catalog_item_id);

-- Avant écriture : le monde vient de la boutique ; l'objet est un objet du
-- catalogue de ce monde, vivant à l'ajout ; ni la boutique ni l'objet d'un
-- article ne changent.
CREATE OR REPLACE FUNCTION public.tg_world_shop_items_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_world uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.shop_id <> OLD.shop_id OR NEW.catalog_item_id <> OLD.catalog_item_id) THEN
    RAISE EXCEPTION 'Un article ne change ni de boutique ni d''objet.' USING ERRCODE = '22023';
  END IF;

  SELECT s.world_id INTO v_world FROM public.world_shops s WHERE s.id = NEW.shop_id;
  IF v_world IS NULL THEN
    RAISE EXCEPTION 'Boutique introuvable.' USING ERRCODE = 'P0002';
  END IF;
  NEW.world_id := v_world;

  PERFORM 1
     FROM public.world_catalog_items c
    WHERE c.id = NEW.catalog_item_id
      AND c.world_id = v_world
      AND c.type = 'inventory'
      AND (c.deleted_at IS NULL OR TG_OP = 'UPDATE');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Objet introuvable dans le catalogue de ce monde.' USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_shop_items_check() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS world_shop_items_check ON public.world_shop_items;
CREATE TRIGGER world_shop_items_check
  BEFORE INSERT OR UPDATE ON public.world_shop_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_shop_items_check();

-- ── 3. ───────────────────────────────────────────────────────
ALTER TABLE public.world_shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_shop_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS world_shops_select ON public.world_shops;
CREATE POLICY world_shops_select ON public.world_shops
  FOR SELECT TO authenticated
  USING (
    public.has_world_permission(world_id, (SELECT auth.uid()), 'economy.manage')
    OR (is_open AND public.is_world_member(world_id, (SELECT auth.uid())))
  );

DROP POLICY IF EXISTS world_shops_insert ON public.world_shops;
CREATE POLICY world_shops_insert ON public.world_shops
  FOR INSERT TO authenticated
  WITH CHECK (public.has_world_permission(world_id, (SELECT auth.uid()), 'economy.manage'));

DROP POLICY IF EXISTS world_shops_update ON public.world_shops;
CREATE POLICY world_shops_update ON public.world_shops
  FOR UPDATE TO authenticated
  USING (public.has_world_permission(world_id, (SELECT auth.uid()), 'economy.manage'))
  WITH CHECK (public.has_world_permission(world_id, (SELECT auth.uid()), 'economy.manage'));

DROP POLICY IF EXISTS world_shops_delete ON public.world_shops;
CREATE POLICY world_shops_delete ON public.world_shops
  FOR DELETE TO authenticated
  USING (public.has_world_permission(world_id, (SELECT auth.uid()), 'economy.manage'));

DROP POLICY IF EXISTS world_shop_items_select ON public.world_shop_items;
CREATE POLICY world_shop_items_select ON public.world_shop_items
  FOR SELECT TO authenticated
  USING (
    public.has_world_permission(world_id, (SELECT auth.uid()), 'economy.manage')
    OR EXISTS (
      SELECT 1 FROM public.world_shops s
       WHERE s.id = shop_id AND s.is_open AND public.is_world_member(s.world_id, (SELECT auth.uid()))
    )
  );

-- `world_id` est posé par le déclencheur avant que la RLS ne vérifie l'ajout.
DROP POLICY IF EXISTS world_shop_items_insert ON public.world_shop_items;
CREATE POLICY world_shop_items_insert ON public.world_shop_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_world_permission(world_id, (SELECT auth.uid()), 'economy.manage'));

DROP POLICY IF EXISTS world_shop_items_update ON public.world_shop_items;
CREATE POLICY world_shop_items_update ON public.world_shop_items
  FOR UPDATE TO authenticated
  USING (public.has_world_permission(world_id, (SELECT auth.uid()), 'economy.manage'))
  WITH CHECK (public.has_world_permission(world_id, (SELECT auth.uid()), 'economy.manage'));

DROP POLICY IF EXISTS world_shop_items_delete ON public.world_shop_items;
CREATE POLICY world_shop_items_delete ON public.world_shop_items
  FOR DELETE TO authenticated
  USING (public.has_world_permission(world_id, (SELECT auth.uid()), 'economy.manage'));

-- ── 4. ───────────────────────────────────────────────────────
ALTER TABLE public.world_economy_ledger DROP CONSTRAINT IF EXISTS world_economy_ledger_kind_check;
ALTER TABLE public.world_economy_ledger
  ADD CONSTRAINT world_economy_ledger_kind_check CHECK (kind IN ('adjust', 'slots', 'purchase', 'sale'));

-- ── 5. ───────────────────────────────────────────────────────
-- Le persona qui achète ou revend, et ses droits : son joueur, ou pour un
-- PNJ qui gère les PNJ. Rend le monde du persona.
CREATE OR REPLACE FUNCTION public.shop_persona_world(p_persona uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_npc   boolean;
  v_world uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.' USING ERRCODE = '42501';
  END IF;
  SELECT p.user_id, p.is_npc, p.world_id INTO v_owner, v_npc, v_world
    FROM public.personas p
   WHERE p.id = p_persona AND p.deleted_at IS NULL AND NOT p.is_template;
  IF v_world IS NULL THEN
    RAISE EXCEPTION 'Persona introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_owner = v_uid OR (v_npc AND public.has_world_permission(v_world, v_uid, 'npc.manage'))) THEN
    RAISE EXCEPTION 'Seul le joueur du persona achète ou revend pour lui.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.worlds w WHERE w.id = v_world AND w.enable_economy AND w.enable_inventory
  ) THEN
    RAISE EXCEPTION 'Les boutiques de ce monde sont fermées.' USING ERRCODE = '55000';
  END IF;
  RETURN v_world;
END;
$$;
REVOKE ALL ON FUNCTION public.shop_persona_world(uuid) FROM PUBLIC, anon, authenticated;

-- Acheter `p_quantity` exemplaires d'un article. Rend le nouveau solde.
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

  IF v_item.price > 0 THEN
    v_balance := public.economy_apply(
      p_persona, -(v_item.price * p_quantity), 'purchase',
      left(format('%s ×%s · %s', v_item.item_name, p_quantity, v_item.shop_name), 200),
      auth.uid()
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
REVOKE ALL ON FUNCTION public.buy_shop_item(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_shop_item(uuid, uuid, integer) TO authenticated;

-- Revendre `p_quantity` exemplaires à la boutique qui vend cet article. Le
-- prix de rachat suit `buybackPriceOf` (lib/worldShops.ts). Rend le nouveau solde.
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

  IF v_item.unit_price > 0 THEN
    v_balance := public.economy_apply(
      p_persona, v_item.unit_price * p_quantity, 'sale',
      left(format('%s ×%s · %s', v_item.item_name, p_quantity, v_item.shop_name), 200),
      auth.uid()
    );
  ELSE
    v_balance := coalesce((SELECT b.balance FROM public.persona_wallets b WHERE b.persona_id = p_persona), 0);
  END IF;
  RETURN v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.sell_shop_item(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_shop_item(uuid, uuid, integer) TO authenticated;

-- Vérifications :
-- SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('world_shops', 'world_shop_items') ORDER BY 1;
-- SELECT has_function_privilege('authenticated', 'public.shop_persona_world(uuid)', 'EXECUTE');  -- → false
