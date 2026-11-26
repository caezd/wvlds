-- ============================================================
-- Migration 265 — Aspect des paliers de monnaie
-- ============================================================
-- Chaque palier de `worlds.currency_units` peut porter un aspect facultatif,
-- rendu par `<Money>` partout où un montant s'affiche :
--   color — une couleur hexadécimale (opacité admise, `is_hex_color`) ;
--   icon  — le nom d'une icône Lucide, en kebab-case ;
--   image — l'URL http(s) d'une image, déposée sous `world-<id>/currency/`.
-- Une clé absente : rien de ce côté. Miroir de `currencyUnitsSchema`
-- (lib/worldCurrency.ts).
--
-- Le bucket `worlds` ouvre ce dossier à qui a `economy.manage`. Les deux
-- policies d'écriture et de suppression du bucket gagnent cette branche ; elles
-- changent de nom, puisqu'elles ne servent plus seulement carte et catalogue.

CREATE OR REPLACE FUNCTION public.is_valid_currency_units(p_units jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry  jsonb;
  v_value  numeric;
  v_values bigint[] := '{}'::bigint[];
  i        integer;
BEGIN
  IF jsonb_typeof(p_units) IS DISTINCT FROM 'array'
     OR NOT (jsonb_array_length(p_units) BETWEEN 1 AND 5) THEN
    RETURN false;
  END IF;

  FOR v_entry IN SELECT e FROM jsonb_array_elements(p_units) AS e LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_entry) k WHERE k NOT IN ('name', 'short', 'value', 'color', 'icon', 'image'))
       OR jsonb_typeof(v_entry->'name') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_entry->'short') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_entry->'value') IS DISTINCT FROM 'number' THEN
      RETURN false;
    END IF;
    IF NOT (char_length(btrim(v_entry->>'name')) BETWEEN 1 AND 30)
       OR char_length(btrim(v_entry->>'short')) > 6 THEN
      RETURN false;
    END IF;
    v_value := (v_entry->>'value')::numeric;
    IF v_value <> trunc(v_value) OR NOT (v_value BETWEEN 1 AND 1000000000000) THEN
      RETURN false;
    END IF;

    -- L'aspect, clé par clé.
    IF v_entry ? 'color' AND (
         jsonb_typeof(v_entry->'color') IS DISTINCT FROM 'string'
         OR NOT public.is_hex_color(v_entry->>'color')) THEN
      RETURN false;
    END IF;
    IF v_entry ? 'icon' AND (
         jsonb_typeof(v_entry->'icon') IS DISTINCT FROM 'string'
         OR NOT (char_length(v_entry->>'icon') BETWEEN 1 AND 64)
         OR (v_entry->>'icon') !~ '^[a-z0-9-]+$') THEN
      RETURN false;
    END IF;
    IF v_entry ? 'image' AND (
         jsonb_typeof(v_entry->'image') IS DISTINCT FROM 'string'
         OR NOT public.is_http_url(v_entry->>'image')) THEN
      RETURN false;
    END IF;

    v_values := v_values || v_value::bigint;
  END LOOP;

  SELECT array_agg(v ORDER BY v DESC) INTO v_values FROM unnest(v_values) AS v;
  IF v_values[array_length(v_values, 1)] <> 1 THEN
    RETURN false;
  END IF;
  FOR i IN 1 .. array_length(v_values, 1) - 1 LOOP
    IF v_values[i] = v_values[i + 1] OR v_values[i] % v_values[i + 1] <> 0 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- ── Le bucket `worlds` ───────────────────────────────────────
DROP POLICY IF EXISTS "worlds: map and catalog editors write" ON storage.objects;
DROP POLICY IF EXISTS "worlds: map and catalog editors delete" ON storage.objects;
DROP POLICY IF EXISTS "worlds: world editors write" ON storage.objects;
DROP POLICY IF EXISTS "worlds: world editors delete" ON storage.objects;
CREATE POLICY "worlds: world editors write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'worlds'
  AND (
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(map|pin)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'map.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(item|category)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'catalog.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/currency/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'economy.manage'))
  )
);
CREATE POLICY "worlds: world editors delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'worlds'
  AND (
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(map|pin)-'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'map.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(item|category)-'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'catalog.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/currency/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'economy.manage'))
  )
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT public.is_valid_currency_units('[{"name":"Or","short":"po","value":1,"color":"#d4a017","icon":"coins"}]');   -- true
-- SELECT public.is_valid_currency_units('[{"name":"Or","short":"po","value":1,"image":"javascript:alert(1)"}]');    -- false
-- SELECT public.is_valid_currency_units('[{"name":"Or","short":"po","value":1,"rate":2}]');                        -- false

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Retirer d'abord l'aspect des paliers qui en ont un, puis réappliquer la
-- définition de is_valid_currency_units de la migration 246, et les policies
-- « map and catalog editors » de la migration 185.
