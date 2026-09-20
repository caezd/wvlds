-- ============================================================
-- Migration 187 — Relations entre objets du catalogue : prérequis et recettes
-- ============================================================
-- Deux besoins, une même forme : une compétence en exige d'autres (« Forge
-- avancée » demande « Forge » et « Métallurgie »), un objet se compose
-- d'autres objets (« Épée » = 2 « Lingot de fer » + 1 « Cuir »). Dans les
-- deux cas, des arêtes d'un objet vers d'autres objets du même catalogue,
-- que la fiche affiche — en liste pour les prérequis, en arbre pour les
-- recettes — et que le canevas de fiche de persona consulte pour n'ajouter
-- une compétence qu'une fois ses prérequis acquis.
--
-- `kind` distingue les deux : `prerequisite` (compétences, sans quantité) et
-- `ingredient` (objets, avec quantité). Le déclencheur tient les règles :
-- même monde, même type, le bon type pour le genre, pas de boucle (une
-- compétence qui s'exigerait elle-même par ricochet, un objet fait de
-- lui-même), vingt arêtes au plus par objet et par genre.

CREATE TABLE IF NOT EXISTS public.world_catalog_item_relations (
  from_id    uuid NOT NULL REFERENCES public.world_catalog_items(id) ON DELETE CASCADE,
  to_id      uuid NOT NULL REFERENCES public.world_catalog_items(id) ON DELETE CASCADE,
  world_id   uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('prerequisite', 'ingredient')),
  quantity   integer NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 9999),
  sort_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_id, to_id, kind),
  CONSTRAINT world_catalog_item_relations_not_self CHECK (from_id <> to_id)
);
CREATE INDEX IF NOT EXISTS world_catalog_item_relations_to_idx ON public.world_catalog_item_relations (to_id, kind);
CREATE INDEX IF NOT EXISTS world_catalog_item_relations_world_idx ON public.world_catalog_item_relations (world_id, kind);

CREATE OR REPLACE FUNCTION public.tg_catalog_item_relation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from  record;
  v_to    record;
  v_count integer;
  v_cycle boolean;
BEGIN
  SELECT i.world_id, i.type INTO v_from FROM public.world_catalog_items i WHERE i.id = NEW.from_id;
  SELECT i.world_id, i.type INTO v_to   FROM public.world_catalog_items i WHERE i.id = NEW.to_id;
  IF v_from IS NULL OR v_to IS NULL THEN RAISE EXCEPTION 'Objet introuvable.'; END IF;
  IF v_from.world_id <> v_to.world_id THEN RAISE EXCEPTION 'Les deux objets doivent appartenir au même monde.'; END IF;
  IF v_from.type <> v_to.type THEN RAISE EXCEPTION 'Les deux objets doivent être du même catalogue.'; END IF;
  IF NEW.kind = 'prerequisite' AND v_from.type <> 'skills' THEN
    RAISE EXCEPTION 'Un prérequis relie deux compétences.';
  END IF;
  IF NEW.kind = 'ingredient' AND v_from.type <> 'inventory' THEN
    RAISE EXCEPTION 'Une recette relie deux objets.';
  END IF;
  IF NEW.kind = 'prerequisite' THEN NEW.quantity := 1; END IF;
  NEW.world_id := v_from.world_id;

  -- Pas de boucle : depuis la cible, en suivant les arêtes du même genre, on
  -- ne doit jamais retomber sur la source.
  WITH RECURSIVE walk(id, depth) AS (
    SELECT NEW.to_id, 1
    UNION
    SELECT r.to_id, w.depth + 1
      FROM public.world_catalog_item_relations r
      JOIN walk w ON w.id = r.from_id
     WHERE r.kind = NEW.kind AND w.depth < 50
  )
  SELECT EXISTS (SELECT 1 FROM walk WHERE id = NEW.from_id) INTO v_cycle;
  IF v_cycle THEN
    RAISE EXCEPTION 'Cette relation formerait une boucle.' USING ERRCODE = 'P0012';
  END IF;

  SELECT count(*) INTO v_count FROM public.world_catalog_item_relations r
   WHERE r.from_id = NEW.from_id AND r.kind = NEW.kind AND r.to_id <> NEW.to_id;
  IF v_count >= 20 THEN RAISE EXCEPTION 'Vingt relations au plus par objet.'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_catalog_item_relation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_catalog_item_relation ON public.world_catalog_item_relations;
CREATE TRIGGER trg_catalog_item_relation
  BEFORE INSERT OR UPDATE ON public.world_catalog_item_relations
  FOR EACH ROW EXECUTE FUNCTION public.tg_catalog_item_relation();

ALTER TABLE public.world_catalog_item_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "world_catalog_item_relations_select" ON public.world_catalog_item_relations FOR SELECT TO authenticated USING (
  public.is_world_member(world_id, (select auth.uid()))
  OR public.is_world_owner_direct(world_id, (select auth.uid()))
);
CREATE POLICY "world_catalog_item_relations_insert" ON public.world_catalog_item_relations FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.world_catalog_items i
           WHERE i.id = from_id AND public.has_world_permission(i.world_id, (select auth.uid()), 'catalog.edit'))
);
CREATE POLICY "world_catalog_item_relations_update" ON public.world_catalog_item_relations FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
);
CREATE POLICY "world_catalog_item_relations_delete" ON public.world_catalog_item_relations FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- A exige B, B exige A → la seconde insertion lève « boucle » ; un objet en prérequis d'une compétence → « même catalogue ».

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP TABLE public.world_catalog_item_relations; DROP FUNCTION public.tg_catalog_item_relation();
