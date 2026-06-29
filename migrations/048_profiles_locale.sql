-- Migration 048 — Préférence de locale utilisateur
-- Ajoute une colonne locale sur profiles pour mémoriser la langue choisie par l'utilisateur.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locale TEXT
    CHECK (locale IN ('fr', 'en', 'es'));
