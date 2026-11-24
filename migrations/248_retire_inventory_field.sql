-- 248 — Le champ de fiche « Inventaire » cède la place à l'inventaire des
-- personas (migration 247).
--
-- 1. `persona_items.icon` : l'icône de jeu (`rpg_icons`) d'une saisie libre,
--    que portaient les objets du champ.
-- 2. Les objets des champs passent dans `persona_items` : une entrée qui
--    pointe un objet vivant du catalogue du monde devient une ligne du
--    catalogue (quantités cumulées, bornées par son maximum), les autres des
--    saisies libres.
-- 3. Les champs disparaissent, et le type avec eux.
-- 4. `persona_field_has_value` oublie le type.
-- 5. `world_catalog_usage` compte les objets dans `persona_items`, les
--    compétences toujours dans les fiches.
--
-- `worlds.restrict_inventory` n'est plus lu ; il tombera après déploiement.

-- ── 1. ───────────────────────────────────────────────────────
ALTER TABLE public.persona_items ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE public.persona_items DROP CONSTRAINT IF EXISTS persona_items_icon_check;
ALTER TABLE public.persona_items
  ADD CONSTRAINT persona_items_icon_check CHECK (
    icon IS NULL OR (catalog_item_id IS NULL AND char_length(icon) <= 128)
  );

-- ── 2. ───────────────────────────────────────────────────────
WITH entrees AS (
  SELECT s.persona_id,
         p.world_id,
         e,
         row_number() OVER (PARTITION BY s.persona_id ORDER BY s.position, f.position, i) AS rang,
         CASE WHEN e->>'quantity' ~ '^[0-9]{1,7}$'
              THEN least(greatest((e->>'quantity')::int, 1), 1000000) ELSE 1 END AS qte,
         c.id AS catalog_id,
         c.max_quantity
    FROM public.persona_section_fields f
    JOIN public.persona_sections s ON s.id = f.section_id
    JOIN public.personas p         ON p.id = s.persona_id
   CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(f.data->'inventoryItems') = 'array' THEN f.data->'inventoryItems' ELSE '[]'::jsonb END
         ) WITH ORDINALITY AS x(e, i)
    LEFT JOIN public.world_catalog_items c
           ON e->>'catalog_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          AND c.id = (e->>'catalog_id')::uuid
          AND c.world_id = p.world_id
          AND c.type = 'inventory'
          AND c.deleted_at IS NULL
   WHERE f.type = 'inventory'
     AND p.world_id IS NOT NULL
),
du_catalogue AS (
  INSERT INTO public.persona_items (persona_id, world_id, catalog_item_id, quantity, sort_index)
  SELECT persona_id, world_id, catalog_id,
         least(sum(qte), coalesce(max(max_quantity), 1000000))::int,
         min(rang)::int
    FROM entrees
   WHERE catalog_id IS NOT NULL
   GROUP BY persona_id, world_id, catalog_id
  RETURNING 1
)
INSERT INTO public.persona_items (persona_id, world_id, name, description, icon, quantity, sort_index)
SELECT persona_id, world_id,
       left(btrim(e->>'name'), 80),
       nullif(left(btrim(coalesce(e->>'description', '')), 1000), ''),
       nullif(left(e->>'icon', 128), ''),
       qte,
       rang::int
  FROM entrees
 WHERE catalog_id IS NULL
   AND btrim(coalesce(e->>'name', '')) <> '';

-- ── 3. ───────────────────────────────────────────────────────
DELETE FROM public.persona_section_fields WHERE type = 'inventory';

ALTER TABLE public.persona_section_fields DROP CONSTRAINT IF EXISTS persona_section_fields_type_check;
ALTER TABLE public.persona_section_fields
  ADD CONSTRAINT persona_section_fields_type_check CHECK (type = ANY (ARRAY[
    'title', 'text', 'stats', 'separator', 'input', 'textarea', 'image-grid',
    'skills', 'gauges', 'quote', 'traits', 'timeline', 'dl'
  ]));

-- ── 4. ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.persona_field_has_value(p_type text, p_data jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE p_type
    WHEN 'title'      THEN true
    WHEN 'separator'  THEN true
    WHEN 'text'       THEN btrim(coalesce(p_data->>'text', '')) <> ''
    WHEN 'input'      THEN btrim(coalesce(p_data->>'text', '')) <> ''
    WHEN 'textarea'   THEN btrim(coalesce(p_data->>'text', '')) <> ''
    WHEN 'quote'      THEN btrim(coalesce(p_data->>'quoteText', '')) <> ''
    WHEN 'stats'      THEN jsonb_typeof(p_data->'items') = 'array' AND jsonb_array_length(p_data->'items') > 0
    WHEN 'image-grid' THEN jsonb_typeof(p_data->'images') = 'array' AND jsonb_array_length(p_data->'images') > 0
    WHEN 'skills'     THEN jsonb_typeof(p_data->'skillItems') = 'array' AND jsonb_array_length(p_data->'skillItems') > 0
    WHEN 'gauges'     THEN jsonb_typeof(p_data->'gaugeItems') = 'array' AND jsonb_array_length(p_data->'gaugeItems') > 0
    WHEN 'traits'     THEN jsonb_typeof(p_data->'traitItems') = 'array' AND jsonb_array_length(p_data->'traitItems') > 0
    WHEN 'timeline'   THEN jsonb_typeof(p_data->'timelineItems') = 'array' AND jsonb_array_length(p_data->'timelineItems') > 0
    WHEN 'dl'         THEN jsonb_typeof(p_data->'dlItems') = 'array' AND jsonb_array_length(p_data->'dlItems') > 0
    ELSE true
  END;
$function$;

-- ── 5. ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.world_catalog_usage(p_world_id uuid)
 RETURNS TABLE(catalog_id uuid, persona_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
    public.is_world_member(p_world_id, (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.owner_id = (select auth.uid()))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH competences AS MATERIALIZED (
    SELECT s.persona_id, f.data->'skillItems' AS entrees
      FROM public.persona_section_fields f
      JOIN public.persona_sections s ON s.id = f.section_id
      JOIN public.personas p         ON p.id = s.persona_id
     WHERE p.world_id = p_world_id
       AND f.type = 'skills'
       AND jsonb_typeof(f.data->'skillItems') = 'array'
  ),
  usages AS (
    SELECT (e->>'catalog_id')::uuid AS id, c.persona_id
      FROM competences c
     CROSS JOIN LATERAL jsonb_array_elements(c.entrees) AS e
     WHERE e->>'catalog_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    UNION ALL
    SELECT i.catalog_item_id, i.persona_id
      FROM public.persona_items i
     WHERE i.world_id = p_world_id
       AND i.catalog_item_id IS NOT NULL
  )
  SELECT u.id AS catalog_id, count(DISTINCT u.persona_id)::integer AS persona_count
    FROM usages u
   GROUP BY 1;
END;
$function$;
