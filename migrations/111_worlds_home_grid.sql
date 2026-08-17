-- ============================================================
-- Migration 111 — Grille de blocs de la page d'accueil
-- ============================================================
-- Remplace l'ancien système à colonne unique (`home_layout`, un simple
-- tableau d'ids de widgets) par une grille 2D où chaque bloc a une position
-- (x, y) et une taille (w, h) en unités de grille, librement déplaçable et
-- redimensionnable par un admin — voir components/worlds/home/worldHomeGrid.ts.
--
-- `home_layout`, `announcement_html` et `announcement_size` restent en base
-- (non supprimés) : le résolveur de la grille (`resolveWorldHomeGrid`) s'en
-- sert pour synthétiser une grille équivalente au premier chargement d'un
-- monde qui n'a pas encore de `home_grid` — colonnes à retirer dans une
-- future migration de nettoyage une fois cette transition bien établie.

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS home_grid JSONB;

-- Pas de nouvelle policy RLS : la RLS de `worlds` s'applique déjà par ligne
-- (pas par colonne) — l'UPDATE existant réservé au owner/admin couvre ce
-- nouveau champ au même titre que home_layout/announcement_html.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.worlds DROP COLUMN IF EXISTS home_grid;
