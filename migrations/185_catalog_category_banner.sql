-- ============================================================
-- Migration 185 — Catégories du catalogue : description et bannière
-- ============================================================
-- Une catégorie du catalogue n'était qu'un nom au-dessus d'une liste. Elle
-- gagne une description (Markdown, comme les objets) et une bannière, toutes
-- deux affichées en tête quand on la déplie — de quoi présenter « Les
-- reliques du Nord » avant d'en lister les objets.
--
-- La bannière vit dans le bucket `worlds`, sous
-- `world-<id>/category-<id>/…`, à côté des images d'objets (`item-`, 163) :
-- les deux politiques du bucket acceptent ce troisième préfixe, toujours
-- sous `catalog.edit`.

ALTER TABLE public.world_catalog_categories
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS banner_url  text;
ALTER TABLE public.world_catalog_categories ADD CONSTRAINT world_catalog_categories_desc_len CHECK (char_length(description) <= 5000);
ALTER TABLE public.world_catalog_categories ADD CONSTRAINT world_catalog_categories_banner_len CHECK (char_length(banner_url) <= 2000);
ALTER TABLE public.world_catalog_categories ADD CONSTRAINT world_catalog_categories_banner_url_http CHECK (public.is_http_url(banner_url));

-- ── Le bucket `worlds` ───────────────────────────────────────
DROP POLICY IF EXISTS "worlds: map and catalog editors write" ON storage.objects;
DROP POLICY IF EXISTS "worlds: map and catalog editors delete" ON storage.objects;
CREATE POLICY "worlds: map and catalog editors write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'worlds'
  AND (
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(map|pin)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'map.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(item|category)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'catalog.edit'))
  )
);
CREATE POLICY "worlds: map and catalog editors delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'worlds'
  AND (
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(map|pin)-'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'map.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(item|category)-'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'catalog.edit'))
  )
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'world_catalog_categories' AND column_name IN ('description','banner_url');
-- SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'worlds: map and catalog%'; -- → 2

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Rejouer les deux politiques de la 179 ;
-- ALTER TABLE public.world_catalog_categories DROP COLUMN description, DROP COLUMN banner_url;
