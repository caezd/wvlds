-- ============================================================
-- Migration 099 — Libellé personnalisé du lien wiki dans la sidebar
-- ============================================================
-- Un fondateur peut renommer l'entrée "Annexes" (Wiki) de la sidebar du
-- monde, ex: "Compendium". NULL = garde le libellé traduit par défaut
-- (worlds.nav.wiki dans messages/*.json).

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS wiki_label TEXT;

-- Pas de nouvelle policy RLS : la RLS de `worlds` s'applique déjà par ligne
-- (pas par colonne) — l'UPDATE existant réservé au owner/admin couvre ce
-- nouveau champ au même titre que name/description/icon_url.
