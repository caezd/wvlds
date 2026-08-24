-- ============================================================
-- Migration 114 — Espacement réglable de la grille de la page d'accueil
-- ============================================================
-- Un admin peut choisir la gouttière entre les blocs de la grille de la page
-- d'accueil ("compact" | "comfortable" | "spacious", voir HOME_GRID_GAP_PRESETS
-- dans worldHomeGrid.ts). NULL = "comfortable", résolu côté client par
-- resolveHomeGridGap().
--
-- Avant ce réglage, le rendu public et l'éditeur admin utilisaient chacun une
-- valeur codée en dur différente (12px / 8px) : l'éditeur ne montrait donc
-- pas fidèlement le résultat final. Les deux lisent désormais cette même
-- colonne.

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS home_grid_gap TEXT;

-- Pas de nouvelle policy RLS : la RLS de `worlds` s'applique déjà par ligne
-- (pas par colonne) — l'UPDATE existant réservé au owner/admin couvre ce
-- nouveau champ au même titre que home_grid.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.worlds DROP COLUMN IF EXISTS home_grid_gap;
