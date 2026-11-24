-- 251 — Économie, lot 4 : les échanges entre personas.
--
-- Un persona donne à un autre de l'argent, des objets, ou les deux, depuis
-- le composeur (bloc « Transférer »). Le transfert est immédiat : pas
-- d'offre à accepter.
--
-- 1. Deux options du monde (Paramètres › Fonctions › Économie › Échanges),
--    coupées par défaut : les échanges, et les échanges entre personas d'un
--    même compte.
-- 2. Le journal des soldes connaît le genre `transfer`.
-- 3. `world_transfers` : la trace de chaque transfert, que le message du
--    composeur désigne par son identifiant. Le message est chiffré et
--    s'écrit librement : c'est cette ligne, écrite par la base seule, qui
--    fait foi pour l'affichage.
-- 4. `transfer_to_persona` : vérifie, déplace et trace d'un bloc.

-- ── 1. ───────────────────────────────────────────────────────
ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS enable_trades       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trades_same_account boolean NOT NULL DEFAULT false;

-- ── 2. ───────────────────────────────────────────────────────
ALTER TABLE public.world_economy_ledger DROP CONSTRAINT IF EXISTS world_economy_ledger_kind_check;
ALTER TABLE public.world_economy_ledger
  ADD CONSTRAINT world_economy_ledger_kind_check CHECK (kind IN ('adjust', 'slots', 'purchase', 'sale', 'transfer'));

-- ── 3. ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_transfers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id        uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  -- Le salon d'où part le transfert ; NULL hors d'un salon.
  chat_id         uuid REFERENCES public.chatrooms(id) ON DELETE SET NULL,
  from_persona_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  to_persona_id   uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  amount          bigint NOT NULL DEFAULT 0,
  -- Ce qui a changé de mains, figé au moment du transfert :
  -- [{catalog_item_id, name, icon, lucide_icon, image_url, quantity}].
  items           jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_transfers_amount_check CHECK (amount BETWEEN 0 AND 1000000000000000),
  CONSTRAINT world_transfers_items_check CHECK (jsonb_typeof(items) = 'array'),
  CONSTRAINT world_transfers_distinct_check CHECK (from_persona_id <> to_persona_id)
);
CREATE INDEX IF NOT EXISTS world_transfers_world_idx ON public.world_transfers (world_id, created_at DESC);
CREATE INDEX IF NOT EXISTS world_transfers_from_idx ON public.world_transfers (from_persona_id);
CREATE INDEX IF NOT EXISTS world_transfers_to_idx ON public.world_transfers (to_persona_id);
CREATE INDEX IF NOT EXISTS world_transfers_chat_idx ON public.world_transfers (chat_id);

ALTER TABLE public.world_transfers ENABLE ROW LEVEL SECURITY;

-- Lecture : les membres du monde. Écriture : la RPC seule (aucune policy).
DROP POLICY IF EXISTS world_transfers_select ON public.world_transfers;
CREATE POLICY world_transfers_select ON public.world_transfers
  FOR SELECT TO authenticated
  USING (public.is_world_member(world_id, (SELECT auth.uid())));

-- ── 4. ───────────────────────────────────────────────────────
-- `p_items` : [{"id": <ligne de persona_items du donneur>, "quantity": n}].
-- Rend l'identifiant du transfert.
CREATE OR REPLACE FUNCTION public.transfer_to_persona(
  p_from   uuid,
  p_to     uuid,
  p_amount bigint DEFAULT 0,
  p_items  jsonb DEFAULT '[]'::jsonb,
  p_chat   uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_from     record;
  v_to       record;
  v_world    record;
  v_same_ok  boolean;
  v_entry    jsonb;
  v_row      record;
  v_qty      integer;
  v_have     integer;
  v_snapshot jsonb := '[]'::jsonb;
  v_chat     uuid;
  v_id       uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise.' USING ERRCODE = '42501';
  END IF;
  p_amount := coalesce(p_amount, 0);
  p_items := coalesce(p_items, '[]'::jsonb);

  -- Le donneur : son joueur, ou pour un PNJ qui gère les PNJ.
  SELECT p.id, p.user_id, p.is_npc, p.world_id, p.name INTO v_from
    FROM public.personas p
   WHERE p.id = p_from AND p.deleted_at IS NULL AND NOT p.is_template;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_from.user_id = v_uid OR (v_from.is_npc AND public.has_world_permission(v_from.world_id, v_uid, 'npc.manage'))) THEN
    RAISE EXCEPTION 'Seul le joueur du persona donne pour lui.' USING ERRCODE = '42501';
  END IF;

  -- Le receveur : un persona vivant du même monde, autre que le donneur.
  SELECT p.id, p.user_id, p.name INTO v_to
    FROM public.personas p
   WHERE p.id = p_to AND p.deleted_at IS NULL AND NOT p.is_template AND p.world_id = v_from.world_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destinataire introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF v_to.id = v_from.id THEN
    RAISE EXCEPTION 'Un persona ne se donne rien à lui-même.' USING ERRCODE = '22023';
  END IF;

  SELECT w.enable_trades, w.trades_same_account, w.enable_economy, w.enable_inventory INTO v_world
    FROM public.worlds w WHERE w.id = v_from.world_id;
  IF NOT v_world.enable_trades THEN
    RAISE EXCEPTION 'Les échanges de ce monde sont désactivés.' USING ERRCODE = '55000';
  END IF;
  v_same_ok := v_world.trades_same_account;
  IF NOT v_same_ok AND v_from.user_id = v_to.user_id THEN
    RAISE EXCEPTION 'Échanges entre personas d''un même compte désactivés.' USING ERRCODE = '42501';
  END IF;

  IF p_amount < 0 OR p_amount > 1000000000000000 THEN
    RAISE EXCEPTION 'Montant invalide.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'Objets invalides.' USING ERRCODE = '22023';
  END IF;
  IF p_amount = 0 AND jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Rien à transférer.' USING ERRCODE = '22023';
  END IF;
  IF p_amount > 0 AND NOT v_world.enable_economy THEN
    RAISE EXCEPTION 'L''économie de ce monde est désactivée.' USING ERRCODE = '55000';
  END IF;
  IF jsonb_array_length(p_items) > 0 AND NOT v_world.enable_inventory THEN
    RAISE EXCEPTION 'L''inventaire de ce monde est désactivé.' USING ERRCODE = '55000';
  END IF;

  -- L'argent : débité puis crédité, chaque mouvement journalisé.
  IF p_amount > 0 THEN
    PERFORM public.economy_apply(
      p_from, -p_amount, 'transfer', left(format('→ %s', v_to.name), 200), v_uid
    );
    PERFORM public.economy_apply(
      p_to, p_amount, 'transfer', left(format('← %s', v_from.name), 200), v_uid
    );
  END IF;

  -- Les objets : retirés au donneur, ajoutés au receveur. Les déclencheurs de
  -- `persona_items` tiennent quantité maximale et emplacements, et annulent
  -- le transfert entier au besoin.
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      v_qty := (v_entry->>'quantity')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Quantité invalide.' USING ERRCODE = '22023';
    END;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 1000000 THEN
      RAISE EXCEPTION 'Quantité invalide.' USING ERRCODE = '22023';
    END IF;

    SELECT i.id, i.catalog_item_id, i.name, i.description, i.icon, i.lucide_icon, i.quantity,
           c.name AS c_name, c.icon AS c_icon, c.lucide_icon AS c_lucide, c.image_url AS c_image
      INTO v_row
      FROM public.persona_items i
      LEFT JOIN public.world_catalog_items c ON c.id = i.catalog_item_id
     WHERE i.id = (v_entry->>'id')::uuid AND i.persona_id = p_from
       FOR UPDATE OF i;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Objet introuvable dans l''inventaire.' USING ERRCODE = 'P0002';
    END IF;
    IF v_row.quantity < v_qty THEN
      RAISE EXCEPTION 'Quantité insuffisante.' USING ERRCODE = '23514';
    END IF;

    IF v_row.quantity = v_qty THEN
      DELETE FROM public.persona_items WHERE id = v_row.id;
    ELSE
      UPDATE public.persona_items SET quantity = quantity - v_qty WHERE id = v_row.id;
    END IF;

    IF v_row.catalog_item_id IS NOT NULL THEN
      SELECT pi.quantity INTO v_have
        FROM public.persona_items pi
       WHERE pi.persona_id = p_to AND pi.catalog_item_id = v_row.catalog_item_id
         FOR UPDATE;
      INSERT INTO public.persona_items (persona_id, world_id, catalog_item_id, quantity, sort_index)
      VALUES (
        p_to, v_from.world_id, v_row.catalog_item_id, coalesce(v_have, 0) + v_qty,
        coalesce((SELECT max(sort_index) + 1 FROM public.persona_items WHERE persona_id = p_to), 0)
      )
      ON CONFLICT (persona_id, catalog_item_id) WHERE catalog_item_id IS NOT NULL
      DO UPDATE SET quantity = EXCLUDED.quantity;
    ELSE
      -- Une saisie libre passe telle quelle, en nouvelle ligne.
      INSERT INTO public.persona_items (persona_id, world_id, name, description, icon, lucide_icon, quantity, sort_index)
      VALUES (
        p_to, v_from.world_id, v_row.name, v_row.description, v_row.icon, v_row.lucide_icon, v_qty,
        coalesce((SELECT max(sort_index) + 1 FROM public.persona_items WHERE persona_id = p_to), 0)
      );
    END IF;

    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
      'catalog_item_id', v_row.catalog_item_id,
      'name', coalesce(v_row.c_name, v_row.name),
      'icon', coalesce(v_row.c_icon, v_row.icon),
      'lucide_icon', coalesce(v_row.c_lucide, v_row.lucide_icon),
      'image_url', v_row.c_image,
      'quantity', v_qty
    ));
  END LOOP;

  -- Le salon n'est retenu que s'il est de ce monde.
  SELECT c.id INTO v_chat FROM public.chatrooms c WHERE c.id = p_chat AND c.world_id = v_from.world_id;

  INSERT INTO public.world_transfers (world_id, chat_id, from_persona_id, to_persona_id, amount, items, actor_id)
  VALUES (v_from.world_id, v_chat, p_from, p_to, p_amount, v_snapshot, v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_to_persona(uuid, uuid, bigint, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_to_persona(uuid, uuid, bigint, jsonb, uuid) TO authenticated;
