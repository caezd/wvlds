-- 203 — Les couleurs enregistrées admettent une opacité.
--
-- Le sélecteur de couleur a un curseur d'opacité et écrit `#rrggbbaa` pour une
-- couleur translucide (`#rrggbb` reste la forme d'une couleur opaque). La
-- fonction de la migration 171 n'admettait que `#rgb` et `#rrggbb` ; elle
-- admet désormais aussi `#rgba` et `#rrggbbaa`.
--
-- Toutes les contraintes `*_hex` des tables (personas, épingles et régions de
-- carte, groupes de personas, types de relation, mondes) passent par cette
-- fonction : on l'élargit en place, sans toucher aux contraintes. Élargir ne
-- remet en cause aucune ligne existante.
--
-- Le code miroir : `hexColorSchema` dans lib/inputSchemas.ts.

CREATE OR REPLACE FUNCTION public.is_hex_color(color TEXT)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT color IS NULL OR color ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$';
$$;
