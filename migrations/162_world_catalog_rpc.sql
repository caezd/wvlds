-- ============================================================
-- Migration 162 — Réordonner en une requête, compter les usages
-- ============================================================
-- ── Le réordonnancement ──────────────────────────────────────
-- Déplacer un objet dans le catalogue réécrit le rang de tous ses voisins.
-- Le client envoyait un `UPDATE` par ligne, en parallèle : dix objets dans une
-- catégorie, dix allers-retours, et autant d'occasions qu'un seul échoue en
-- laissant l'ordre à moitié écrit. Un `jsonb_to_recordset` fait la même chose
-- en une requête et en une transaction.
--
-- SECURITY INVOKER (le défaut) : la RLS de `world_catalog_items` s'applique
-- telle quelle, rien n'est ré-implémenté ici. Mais une RLS qui refuse ne lève
-- pas d'erreur — elle ne met à jour aucune ligne, en silence. La fonction rend
-- donc le NOMBRE de lignes touchées : l'appelant le compare à ce qu'il a
-- envoyé et sait, lui, que l'ordre affiché ne correspond à rien.

CREATE OR REPLACE FUNCTION public.reorder_world_catalog_items(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items doit être un tableau JSON';
  END IF;

  UPDATE public.world_catalog_items t
     SET sort_index  = e.sort_index,
         category_id = e.category_id
    FROM jsonb_to_recordset(p_items) AS e(id uuid, sort_index integer, category_id uuid)
   WHERE t.id = e.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_world_catalog_categories(p_categories jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_categories) <> 'array' THEN
    RAISE EXCEPTION 'p_categories doit être un tableau JSON';
  END IF;

  UPDATE public.world_catalog_categories t
     SET sort_index   = e.sort_index,
         column_index = e.column_index
    FROM jsonb_to_recordset(p_categories) AS e(id uuid, sort_index integer, column_index integer)
   WHERE t.id = e.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- ── Le décompte d'usage ──────────────────────────────────────
-- « Cet objet est-il porté par quelqu'un ? » — la question se pose avant de le
-- supprimer du catalogue. La réponse est éparpillée dans le JSONB des fiches :
-- `persona_section_fields.data->'inventoryItems'`, un tableau d'entrées dont
-- `catalog_id` désigne l'objet.
--
-- SECURITY DEFINER, et c'est le point délicat : la RLS des fiches ne laisse
-- voir à personne les champs des personas d'autrui, alors qu'un éditeur doit
-- pouvoir compter. La fonction contourne donc la RLS — et se doit d'être
-- exacte sur qui a le droit d'appeler. Deux garde-fous :
--   1. un contrôle d'appartenance au monde, en clair, avant toute lecture ;
--   2. un résultat AGRÉGÉ — un nombre, jamais un nom de persona ni un
--      identifiant de fiche. Personne n'apprend qui possède quoi.
--
-- Le `jsonb_typeof(...) = 'array'` est dans la CTE, et la CTE est MATERIALIZED :
-- sans cela le planificateur peut remonter `jsonb_array_elements` avant le
-- filtre, et la fonction tombe sur la première fiche dont le champ ne serait
-- pas un tableau. Le motif sur `catalog_id` protège de même le cast en UUID.
CREATE OR REPLACE FUNCTION public.world_catalog_usage(p_world_id uuid)
RETURNS TABLE (catalog_id uuid, persona_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT (
    public.is_world_member(p_world_id, (select auth.uid()))
    OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.owner_id = (select auth.uid()))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH champs AS MATERIALIZED (
    SELECT s.persona_id,
           CASE f.type WHEN 'inventory' THEN f.data->'inventoryItems' ELSE f.data->'skillItems' END AS entrees
      FROM public.persona_section_fields f
      JOIN public.persona_sections s ON s.id = f.section_id
      JOIN public.personas p         ON p.id = s.persona_id
     WHERE p.world_id = p_world_id
       AND f.type IN ('inventory', 'skills')
       AND jsonb_typeof(CASE f.type WHEN 'inventory' THEN f.data->'inventoryItems' ELSE f.data->'skillItems' END) = 'array'
  )
  SELECT (e->>'catalog_id')::uuid AS catalog_id,
         count(DISTINCT c.persona_id)::integer AS persona_count
    FROM champs c
   CROSS JOIN LATERAL jsonb_array_elements(c.entrees) AS e
   WHERE e->>'catalog_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   GROUP BY 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_world_catalog_items(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_world_catalog_categories(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.world_catalog_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_world_catalog_items(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_world_catalog_categories(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.world_catalog_usage(uuid) TO authenticated;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT proname, prosecdef FROM pg_proc
--    WHERE proname IN ('reorder_world_catalog_items','reorder_world_catalog_categories','world_catalog_usage');
--   -- attendu : les deux reorder en f (invoker), world_catalog_usage en t (definer)

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.reorder_world_catalog_items(jsonb);
-- DROP FUNCTION IF EXISTS public.reorder_world_catalog_categories(jsonb);
-- DROP FUNCTION IF EXISTS public.world_catalog_usage(uuid);
