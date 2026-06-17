-- ============================================================
-- Migration 009 — Préférences utilisateur par monde
-- Stocke les préférences UI d'un user pour chaque monde
-- (largeur de l'aside personas, mode plein écran du contenu).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.world_user_preferences (
  world_id       UUID        NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  aside_width    SMALLINT    NOT NULL DEFAULT 192,
  main_expanded  BOOLEAN     NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, user_id)
);

ALTER TABLE public.world_user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "world_user_prefs: owner access"
  ON public.world_user_preferences
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_world_user_prefs_world
  ON public.world_user_preferences (world_id);
