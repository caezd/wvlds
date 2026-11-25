-- ============================================================
-- Migration 262 — Pas de rachat quand les joueurs gèrent leur inventaire
-- ============================================================
-- FAILLE CORRIGÉE (audit du 2026-11-25). En mode d'inventaire « libre » ou
-- « catalogue », le joueur ajoute lui-même les objets du catalogue à son
-- inventaire (`persona_inventory_can_edit`). Une boutique qui rachète ces
-- objets les changeait en argent : s'ajouter dix épées, les revendre, et la
-- bourse se remplissait sans limite.
--
-- Décision : la revente n'existe que si l'équipe tient l'inventaire
-- (`inventory_mode = 'held'`). Les réglages de rachat des boutiques sont
-- conservés et reprennent effet si le monde repasse dans ce mode ;
-- l'interface les masque en attendant (`worldAllowsBuyback`).

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

  -- Pas de rachat quand les joueurs remplissent eux-mêmes leur inventaire.
  IF (SELECT w.inventory_mode FROM public.worlds w WHERE w.id = v_world) IS DISTINCT FROM 'held' THEN
    RAISE EXCEPTION 'Pas de rachat : les joueurs gèrent eux-mêmes leur inventaire.' USING ERRCODE = '55000';
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

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Réappliquer la définition de sell_shop_item de la migration 254.
