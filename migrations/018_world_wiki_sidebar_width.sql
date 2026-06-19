-- Largeur de la sidebar de navigation du wiki, persistée par utilisateur et par monde
ALTER TABLE public.world_user_preferences
  ADD COLUMN IF NOT EXISTS wiki_sidebar_width SMALLINT NOT NULL DEFAULT 208;
