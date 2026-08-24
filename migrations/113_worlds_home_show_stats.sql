-- ============================================================
-- Migration 113 — Statistiques épinglées sous le titre
-- ============================================================
-- Le widget « Statistiques » n'est plus un bloc plaçable dans la grille (il
-- ne peut plus être positionné/redimensionné avec les autres) : c'est
-- désormais une zone fixe sous le titre/description de la page d'accueil,
-- dont l'affichage se règle par une simple case à cocher (Réglages > Page
-- d'accueil, voir WorldHomeGridSettings.tsx), pas par sa présence dans un
-- ordre ou une grille de blocs.

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS home_show_stats BOOLEAN;

-- Migration des données existantes : un monde qui avait déjà "stats" dans
-- son home_grid (nouveau système) ou son home_layout (ancien système) passe
-- automatiquement à home_show_stats = true, avant que l'entrée correspondante
-- ne soit retirée de home_grid/home_layout ci-dessous (elle n'y a plus sa
-- place).
UPDATE public.worlds
SET home_show_stats = true
WHERE (home_layout @> '["stats"]'::jsonb)
   OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(COALESCE(home_grid, '[]'::jsonb)) elem
     WHERE elem->>'widgetId' = 'stats'
   );

UPDATE public.worlds
SET home_grid = COALESCE(
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(home_grid) elem
    WHERE elem->>'widgetId' IS DISTINCT FROM 'stats'
  ),
  '[]'::jsonb
)
WHERE home_grid IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(home_grid) elem WHERE elem->>'widgetId' = 'stats'
  );

UPDATE public.worlds
SET home_layout = COALESCE(
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(home_layout) elem
    WHERE elem <> '"stats"'::jsonb
  ),
  '[]'::jsonb
)
WHERE home_layout @> '["stats"]'::jsonb;

-- Pas de nouvelle policy RLS : la RLS de `worlds` s'applique déjà par ligne
-- (pas par colonne) — l'UPDATE existant réservé au owner/admin couvre ce
-- nouveau champ au même titre que home_grid.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.worlds DROP COLUMN IF EXISTS home_show_stats;
