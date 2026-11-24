-- 250 — Les boutiques deviennent une option du monde.
--
-- Elles s'ouvraient d'office dès que l'économie et l'inventaire étaient
-- actifs. Elles se règlent désormais dans Paramètres › Fonctions › Économie,
-- au même titre que les objets : coupées par défaut. Couper l'option garde
-- boutiques, articles et stocks ; seuls la vue et les achats disparaissent.

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS enable_shops boolean NOT NULL DEFAULT false;

-- Un achat ou une revente demande désormais aussi l'option.
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
    SELECT 1 FROM public.worlds w
     WHERE w.id = v_world AND w.enable_economy AND w.enable_inventory AND w.enable_shops
  ) THEN
    RAISE EXCEPTION 'Les boutiques de ce monde sont fermées.' USING ERRCODE = '55000';
  END IF;
  RETURN v_world;
END;
$$;
REVOKE ALL ON FUNCTION public.shop_persona_world(uuid) FROM PUBLIC, anon, authenticated;
