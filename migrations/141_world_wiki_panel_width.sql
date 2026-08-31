-- ============================================================
-- Migration 141 — Largeur de la colonne latérale d'une page de wiki
-- ============================================================
-- Pendant du `wiki_sidebar_width` de la migration 018, qui retient la largeur
-- de l'arbre de navigation. La colonne des commentaires et des notes se
-- redimensionne de la même façon, et sa largeur se retient au même endroit :
-- une préférence par personne et par monde.
--
-- SMALLINT comme sa voisine : les bornes de l'interface sont 240–560 px, très
-- loin de déborder. Le défaut, 320, est la largeur d'origine du panneau.

ALTER TABLE public.world_user_preferences
  ADD COLUMN IF NOT EXISTS wiki_panel_width SMALLINT NOT NULL DEFAULT 320;

-- ── VÉRIFICATION ─────────────────────────────────────────────
--   SELECT column_name, column_default FROM information_schema.columns
--    WHERE table_name = 'world_user_preferences' AND column_name = 'wiki_panel_width';
--     -- wiki_panel_width | 320

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.world_user_preferences DROP COLUMN IF EXISTS wiki_panel_width;
