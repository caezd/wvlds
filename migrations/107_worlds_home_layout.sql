-- ============================================================
-- Migration 107 — Page d'accueil de monde personnalisable
-- ============================================================
-- Ordre des widgets (catégories, composer, salons, stats, membres en ligne,
-- annonce, raccourcis wiki, personas récents) choisi par un admin du monde,
-- appliqué à tous les visiteurs. NULL = ordre par défaut (résolu côté client
-- par resolveWorldHomeLayout(), voir components/worlds/home/worldHomeWidgets.ts).

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS home_layout JSONB;

-- Pas de nouvelle policy RLS : la RLS de `worlds` s'applique déjà par ligne
-- (pas par colonne) — l'UPDATE existant réservé au owner/admin couvre ce
-- nouveau champ au même titre que wiki_label.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.worlds DROP COLUMN IF EXISTS home_layout;
