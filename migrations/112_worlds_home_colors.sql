-- ============================================================
-- Migration 112 — Couleurs personnalisables de la page d'accueil
-- ============================================================
-- Refonte visuelle de la page d'accueil d'un monde (bannière avec fondu vers
-- le bas + panel de contenu). Un admin peut personnaliser la couleur de fond
-- du "body" (zone sous la bannière, derrière le panel) et celle du "panel"
-- (carte de contenu). NULL = couleurs par défaut du thème (bg-secondary /
-- bg-card), résolues côté client dans WorldHome.tsx.

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS home_body_color TEXT,
  ADD COLUMN IF NOT EXISTS home_panel_color TEXT;

-- Pas de nouvelle policy RLS : la RLS de `worlds` s'applique déjà par ligne
-- (pas par colonne) — l'UPDATE existant réservé au owner/admin couvre ces
-- nouveaux champs au même titre que home_layout.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.worlds DROP COLUMN IF EXISTS home_body_color;
-- ALTER TABLE public.worlds DROP COLUMN IF EXISTS home_panel_color;
