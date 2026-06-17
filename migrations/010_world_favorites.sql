-- ============================================================
-- Migration 010 — Favoris par monde
-- Ajoute is_favorite à world_user_preferences pour permettre
-- aux utilisateurs d'épingler leurs mondes préférés dans la sidebar.
-- ============================================================

ALTER TABLE public.world_user_preferences
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_world_user_prefs_favorite
  ON public.world_user_preferences (user_id, is_favorite)
  WHERE is_favorite = true;
