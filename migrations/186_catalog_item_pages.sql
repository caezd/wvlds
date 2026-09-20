-- ============================================================
-- Migration 186 — Pages du wiki liées à un objet du catalogue
-- ============================================================
-- La fiche d'un objet se contentait de sa description. Elle devient une vraie
-- fiche : la description se rédige en Markdown, avec les `[[liens]]` du wiki,
-- et l'objet porte en plus une liste de pages liées — la page de la forge
-- qui le produit, celle de la maison qui le porte en armoiries.
--
-- Une table de jointure plutôt qu'un tableau d'identifiants : la page
-- supprimée disparaît de la fiche d'elle-même (ON DELETE CASCADE), et
-- l'appartenance au même monde se vérifie à l'écriture. Dix pages au plus par
-- objet — c'est une fiche, pas un index.

CREATE TABLE IF NOT EXISTS public.world_catalog_item_pages (
  item_id    uuid NOT NULL REFERENCES public.world_catalog_items(id) ON DELETE CASCADE,
  page_id    uuid NOT NULL REFERENCES public.world_wiki_pages(id) ON DELETE CASCADE,
  world_id   uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  sort_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, page_id)
);
CREATE INDEX IF NOT EXISTS world_catalog_item_pages_page_idx ON public.world_catalog_item_pages (page_id);

-- `world_id` est celui de l'objet ; la page doit être du même monde ; dix au plus.
CREATE OR REPLACE FUNCTION public.tg_catalog_item_page()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_world uuid; v_count integer;
BEGIN
  SELECT i.world_id INTO v_world FROM public.world_catalog_items i WHERE i.id = NEW.item_id;
  IF v_world IS NULL THEN RAISE EXCEPTION 'Objet introuvable.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.world_wiki_pages p WHERE p.id = NEW.page_id AND p.world_id = v_world) THEN
    RAISE EXCEPTION 'La page liée doit appartenir au monde de l''objet.';
  END IF;
  NEW.world_id := v_world;
  SELECT count(*) INTO v_count FROM public.world_catalog_item_pages l WHERE l.item_id = NEW.item_id AND l.page_id <> NEW.page_id;
  IF v_count >= 10 THEN RAISE EXCEPTION 'Dix pages liées au plus par objet.'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_catalog_item_page() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_catalog_item_page ON public.world_catalog_item_pages;
CREATE TRIGGER trg_catalog_item_page
  BEFORE INSERT OR UPDATE ON public.world_catalog_item_pages
  FOR EACH ROW EXECUTE FUNCTION public.tg_catalog_item_page();

ALTER TABLE public.world_catalog_item_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "world_catalog_item_pages_select" ON public.world_catalog_item_pages FOR SELECT TO authenticated USING (
  public.is_world_member(world_id, (select auth.uid()))
  OR public.is_world_owner_direct(world_id, (select auth.uid()))
);
CREATE POLICY "world_catalog_item_pages_insert" ON public.world_catalog_item_pages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.world_catalog_items i
           WHERE i.id = item_id AND public.has_world_permission(i.world_id, (select auth.uid()), 'catalog.edit'))
);
CREATE POLICY "world_catalog_item_pages_delete" ON public.world_catalog_item_pages FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- En tant qu'éditeur : INSERT INTO world_catalog_item_pages (item_id, page_id, world_id) VALUES (<objet>, <page du monde>, '00000000-…') → world_id recopié ;
--   une page d'un autre monde → exception ; un membre sans catalog.edit → refus RLS.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP TABLE public.world_catalog_item_pages; DROP FUNCTION public.tg_catalog_item_page();
