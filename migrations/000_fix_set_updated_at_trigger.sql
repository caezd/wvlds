-- ============================================================
-- Fix 000 — Sécuriser le trigger set_updated_at()
--
-- Le trigger existant fait "NEW.updated_at := now()" sans vérifier
-- si la colonne existe, ce qui plante sur les tables sans updated_at.
-- Ce patch le rend safe : il ne touche la colonne que si elle existe.
--
-- À exécuter AVANT les migrations 001 et 002.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- On ne modifie updated_at que si la table possède cette colonne
  IF to_jsonb(NEW) ? 'updated_at' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
