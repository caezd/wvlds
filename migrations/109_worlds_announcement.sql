-- ============================================================
-- Migration 109 — Widget « Annonce » de la page d'accueil
-- ============================================================
-- Un admin de monde peut rédiger une annonce en HTML/CSS libre (jamais de
-- JS : le rendu passe par un <iframe sandbox=""> sans allow-scripts, une
-- garantie du navigateur plutôt qu'un filtrage de contenu). `announcement_size`
-- ("small" | "medium" | "large") contrôle la hauteur d'affichage du widget.

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS announcement_html TEXT,
  ADD COLUMN IF NOT EXISTS announcement_size TEXT;

-- Pas de nouvelle policy RLS : la RLS de `worlds` s'applique déjà par ligne
-- (pas par colonne) — l'UPDATE existant réservé au owner/admin couvre ces
-- nouveaux champs au même titre que home_layout.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.worlds DROP COLUMN IF EXISTS announcement_html;
-- ALTER TABLE public.worlds DROP COLUMN IF EXISTS announcement_size;
