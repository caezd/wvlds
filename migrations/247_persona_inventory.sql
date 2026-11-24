-- 247 — Économie, lot 2 : l'inventaire d'un persona, tenu par la base.
--
-- Jusqu'ici l'inventaire était un champ JSON de la fiche, que le joueur
-- éditait à sa guise (aucun n'est rempli en prod). Il devient une table,
-- dont le monde règle l'accès (lib/personaInventory.ts) :
-- - `free` : le joueur crée et modifie ses objets, du catalogue ou non ;
-- - `catalog` : le joueur pioche lui-même dans le catalogue, rien d'autre ;
-- - `held` : le joueur n'ajoute rien ; objets reçus du MJ, achetés, échangés.
--
-- 1. Les réglages du monde : mode, emplacements (départ, plafond, prix).
-- 2. Les emplacements achetés, sur la bourse du persona.
-- 3. `persona_items` et ses contrôles (même monde, plafond de quantité,
--    capacité de l'inventaire).
-- 4. Qui écrit : le joueur selon le mode (RLS), qui gère l'économie par
--    `adjust_persona_item`.
-- 5. `extend_persona_inventory` : acheter des emplacements.

-- ── 1. ───────────────────────────────────────────────────────
ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS inventory_mode          text    NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS inventory_slots_default integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inventory_slots_max     integer,
  ADD COLUMN IF NOT EXISTS inventory_slot_cost     bigint;

ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_inventory_mode_check;
ALTER TABLE public.worlds
  ADD CONSTRAINT worlds_inventory_mode_check CHECK (inventory_mode IN ('free', 'catalog', 'held'));
ALTER TABLE public.worlds DROP CONSTRAINT IF EXISTS worlds_inventory_slots_check;
ALTER TABLE public.worlds
  ADD CONSTRAINT worlds_inventory_slots_check CHECK (
    inventory_slots_default BETWEEN 0 AND 1000
    AND (inventory_slots_max IS NULL OR (inventory_slots_max BETWEEN 1 AND 1000 AND inventory_slots_max >= inventory_slots_default))
    AND (inventory_slot_cost IS NULL OR inventory_slot_cost BETWEEN 0 AND 1000000000000)
  );

-- « Restreint au catalogue » devient le mode `catalog`.
UPDATE public.worlds SET inventory_mode = 'catalog' WHERE restrict_inventory AND inventory_mode = 'free';

-- ── 2. ───────────────────────────────────────────────────────
ALTER TABLE public.persona_wallets
  ADD COLUMN IF NOT EXISTS extra_slots integer NOT NULL DEFAULT 0;
ALTER TABLE public.persona_wallets DROP CONSTRAINT IF EXISTS persona_wallets_extra_slots_check;
ALTER TABLE public.persona_wallets
  ADD CONSTRAINT persona_wallets_extra_slots_check CHECK (extra_slots BETWEEN 0 AND 1000);

ALTER TABLE public.world_economy_ledger DROP CONSTRAINT IF EXISTS world_economy_ledger_kind_check;
ALTER TABLE public.world_economy_ledger
  ADD CONSTRAINT world_economy_ledger_kind_check CHECK (kind IN ('adjust', 'slots'));

-- ── 3. ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.persona_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id      uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  world_id        uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  -- Un objet du catalogue ; NULL : une saisie libre, qui porte son nom.
  catalog_item_id uuid REFERENCES public.world_catalog_items(id) ON DELETE CASCADE,
  name            text,
  description     text,
  lucide_icon     text,
  quantity        integer NOT NULL DEFAULT 1,
  sort_index      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persona_items_quantity_check CHECK (quantity BETWEEN 1 AND 1000000),
  CONSTRAINT persona_items_kind_check CHECK (
    (catalog_item_id IS NOT NULL AND name IS NULL AND description IS NULL AND lucide_icon IS NULL)
    OR (catalog_item_id IS NULL AND name IS NOT NULL)
  )
);
ALTER TABLE public.persona_items DROP CONSTRAINT IF EXISTS persona_items_name_length;
ALTER TABLE public.persona_items
  ADD CONSTRAINT persona_items_name_length CHECK (char_length(name) <= 80);
ALTER TABLE public.persona_items DROP CONSTRAINT IF EXISTS persona_items_description_length;
ALTER TABLE public.persona_items
  ADD CONSTRAINT persona_items_description_length CHECK (char_length(description) <= 1000);
ALTER TABLE public.persona_items DROP CONSTRAINT IF EXISTS persona_items_lucide_icon_length;
ALTER TABLE public.persona_items
  ADD CONSTRAINT persona_items_lucide_icon_length CHECK (char_length(lucide_icon) <= 64);

-- Un objet du catalogue n'a qu'une ligne par persona : sa quantité.
CREATE UNIQUE INDEX IF NOT EXISTS persona_items_catalog_unique
  ON public.persona_items (persona_id, catalog_item_id) WHERE catalog_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS persona_items_persona_idx ON public.persona_items (persona_id, sort_index);
CREATE INDEX IF NOT EXISTS persona_items_world_idx ON public.persona_items (world_id);
CREATE INDEX IF NOT EXISTS persona_items_catalog_idx ON public.persona_items (catalog_item_id);

-- Les emplacements occupés : un par objet empilable (ou saisie libre), un
-- par exemplaire d'un objet unique. Miroir de `slotsUsed`.
CREATE OR REPLACE FUNCTION public.inventory_slots_of(p_persona uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(sum(CASE WHEN c.stackable = false THEN i.quantity ELSE 1 END), 0)::integer
    FROM public.persona_items i
    LEFT JOIN public.world_catalog_items c ON c.id = i.catalog_item_id
   WHERE i.persona_id = p_persona;
$$;
REVOKE ALL ON FUNCTION public.inventory_slots_of(uuid) FROM PUBLIC, anon, authenticated;

-- Avant écriture : le monde vient du persona, l'objet du catalogue est un
-- objet vivant de ce monde, sa quantité maximale est tenue ; ni le persona
-- ni l'objet d'une ligne ne changent.
CREATE OR REPLACE FUNCTION public.tg_persona_items_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_world uuid;
  v_max   integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.persona_id <> OLD.persona_id OR NEW.catalog_item_id IS DISTINCT FROM OLD.catalog_item_id) THEN
    RAISE EXCEPTION 'Une ligne d''inventaire ne change ni de persona ni d''objet.' USING ERRCODE = '22023';
  END IF;

  SELECT p.world_id INTO v_world
    FROM public.personas p
   WHERE p.id = NEW.persona_id AND p.deleted_at IS NULL AND NOT p.is_template;
  IF v_world IS NULL THEN
    RAISE EXCEPTION 'Persona introuvable.' USING ERRCODE = 'P0002';
  END IF;
  NEW.world_id := v_world;

  IF NEW.catalog_item_id IS NOT NULL THEN
    SELECT c.max_quantity INTO v_max
      FROM public.world_catalog_items c
     WHERE c.id = NEW.catalog_item_id
       AND c.world_id = v_world
       AND c.type = 'inventory'
       AND (c.deleted_at IS NULL OR TG_OP = 'UPDATE');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Objet introuvable dans le catalogue de ce monde.' USING ERRCODE = 'P0002';
    END IF;
    IF v_max IS NOT NULL AND NEW.quantity > v_max THEN
      RAISE EXCEPTION 'Quantité maximale dépassée.' USING ERRCODE = '23514';
    END IF;
  ELSE
    NEW.name := btrim(NEW.name);
    IF NEW.name = '' THEN
      RAISE EXCEPTION 'Un objet doit porter un nom.' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_persona_items_check() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS persona_items_check ON public.persona_items;
CREATE TRIGGER persona_items_check
  BEFORE INSERT OR UPDATE ON public.persona_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_persona_items_check();

-- Après écriture : l'inventaire tient dans ses emplacements.
CREATE OR REPLACE FUNCTION public.tg_persona_items_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_default integer;
  v_extra   integer;
BEGIN
  SELECT w.inventory_slots_default INTO v_default FROM public.worlds w WHERE w.id = NEW.world_id;
  IF coalesce(v_default, 0) = 0 THEN
    RETURN NULL;
  END IF;
  SELECT coalesce((SELECT b.extra_slots FROM public.persona_wallets b WHERE b.persona_id = NEW.persona_id), 0)
    INTO v_extra;
  IF public.inventory_slots_of(NEW.persona_id) > v_default + v_extra THEN
    RAISE EXCEPTION 'Inventaire plein.' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_persona_items_capacity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS persona_items_capacity ON public.persona_items;
CREATE TRIGGER persona_items_capacity
  AFTER INSERT OR UPDATE OF quantity ON public.persona_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_persona_items_capacity();

-- ── 4. ───────────────────────────────────────────────────────
-- Le joueur (ou, pour un PNJ, qui gère les PNJ) peut-il écrire cette ligne
-- lui-même ? Selon le mode : tout, les objets du catalogue seuls, rien.
CREATE OR REPLACE FUNCTION public.persona_inventory_can_edit(p_persona uuid, p_custom boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.personas p
      JOIN public.worlds w ON w.id = p.world_id
     WHERE p.id = p_persona
       AND p.deleted_at IS NULL
       AND NOT p.is_template
       AND w.enable_inventory
       AND (
         p.user_id = (SELECT auth.uid())
         OR (p.is_npc AND public.has_world_permission(w.id, (SELECT auth.uid()), 'npc.manage'))
       )
       AND (w.inventory_mode = 'free' OR (w.inventory_mode = 'catalog' AND NOT p_custom))
  );
$$;
REVOKE ALL ON FUNCTION public.persona_inventory_can_edit(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.persona_inventory_can_edit(uuid, boolean) TO authenticated;

ALTER TABLE public.persona_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS persona_items_select ON public.persona_items;
CREATE POLICY persona_items_select ON public.persona_items
  FOR SELECT TO authenticated
  USING (public.is_world_member(world_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS persona_items_insert ON public.persona_items;
CREATE POLICY persona_items_insert ON public.persona_items
  FOR INSERT TO authenticated
  WITH CHECK (public.persona_inventory_can_edit(persona_id, catalog_item_id IS NULL));

DROP POLICY IF EXISTS persona_items_update ON public.persona_items;
CREATE POLICY persona_items_update ON public.persona_items
  FOR UPDATE TO authenticated
  USING (public.persona_inventory_can_edit(persona_id, catalog_item_id IS NULL))
  WITH CHECK (public.persona_inventory_can_edit(persona_id, catalog_item_id IS NULL));

DROP POLICY IF EXISTS persona_items_delete ON public.persona_items;
CREATE POLICY persona_items_delete ON public.persona_items
  FOR DELETE TO authenticated
  USING (public.persona_inventory_can_edit(persona_id, catalog_item_id IS NULL));

-- Donner (delta > 0) ou retirer (delta < 0) un objet du catalogue, quel que
-- soit le mode : réservé à qui gère l'économie. Rend la nouvelle quantité.
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
  RETURN v_qty;
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_persona_item(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_persona_item(uuid, uuid, integer) TO authenticated;

-- ── 5. ───────────────────────────────────────────────────────
-- Acheter des emplacements : le joueur du persona (ou qui gère les PNJ),
-- au prix du monde, dans la limite du plafond. Rend les emplacements achetés.
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

  IF v_world.inventory_slot_cost > 0 THEN
    PERFORM public.economy_apply(p_persona, -(v_world.inventory_slot_cost * p_slots), 'slots', NULL, v_uid);
  END IF;
  UPDATE public.persona_wallets SET extra_slots = v_extra + p_slots WHERE persona_id = p_persona;
  RETURN v_extra + p_slots;
END;
$$;
REVOKE ALL ON FUNCTION public.extend_persona_inventory(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_persona_inventory(uuid, integer) TO authenticated;

-- Vérifications :
-- SELECT inventory_mode, count(*) FROM public.worlds GROUP BY 1;
-- SELECT has_function_privilege('authenticated', 'public.inventory_slots_of(uuid)', 'EXECUTE');  -- → false
