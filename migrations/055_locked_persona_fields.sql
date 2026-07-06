-- ============================================================
-- Migration 055 — Champs verrouillés de la fiche par défaut
-- Le propriétaire d'un monde peut verrouiller des champs de la
-- fiche modèle (054). Le flag `locked` est copié à la création
-- d'un persona : le champ devient insupprimable sur la fiche du
-- joueur (et sa section avec lui), garantissant sa présence.
-- Les triggers ci-dessous font respecter la règle au niveau DB :
--   - le flag ne se modifie que sur un persona modèle ;
--   - champ verrouillé et section qui en contient un ne peuvent
--     pas être supprimés, SAUF quand le parent (persona/section)
--     est lui-même en cours de suppression (cascade) — dans ce
--     cas le parent n'existe déjà plus au moment du trigger.
-- À exécuter dans le SQL Editor du dashboard Supabase.
-- ============================================================

-- ── 1. Colonne locked ─────────────────────────────────────────
ALTER TABLE public.persona_section_fields
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Le flag n'est modifiable que sur une fiche modèle ─────
CREATE OR REPLACE FUNCTION public.guard_locked_field_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tmpl BOOLEAN;
BEGIN
  IF NEW.locked IS NOT DISTINCT FROM OLD.locked THEN RETURN NEW; END IF;
  SELECT p.is_template INTO tmpl
    FROM public.persona_sections s
    JOIN public.personas p ON p.id = s.persona_id
    WHERE s.id = OLD.section_id;
  IF tmpl IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Locked flag can only change on a world persona template'
      USING ERRCODE = 'P0010';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_field_update_guard_locked ON public.persona_section_fields;
CREATE TRIGGER before_field_update_guard_locked
  BEFORE UPDATE ON public.persona_section_fields
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_field_update();

-- ── 3. Un champ verrouillé ne se supprime pas ─────────────────
CREATE OR REPLACE FUNCTION public.guard_locked_field_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tmpl BOOLEAN;
BEGIN
  IF NOT OLD.locked THEN RETURN OLD; END IF;
  SELECT p.is_template INTO tmpl
    FROM public.persona_sections s
    JOIN public.personas p ON p.id = s.persona_id
    WHERE s.id = OLD.section_id;
  -- Parent introuvable = suppression en cascade (section/persona) : autorisé
  IF NOT FOUND OR tmpl THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'This field is required by the world persona template'
    USING ERRCODE = 'P0010';
END;
$$;

DROP TRIGGER IF EXISTS before_field_delete_guard_locked ON public.persona_section_fields;
CREATE TRIGGER before_field_delete_guard_locked
  BEFORE DELETE ON public.persona_section_fields
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_field_delete();

-- ── 4. Une section contenant un champ verrouillé non plus ────
CREATE OR REPLACE FUNCTION public.guard_locked_section_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tmpl BOOLEAN;
BEGIN
  SELECT p.is_template INTO tmpl FROM public.personas p WHERE p.id = OLD.persona_id;
  -- Persona introuvable = suppression du persona en cours : autorisé
  IF NOT FOUND OR tmpl THEN RETURN OLD; END IF;
  IF EXISTS (
    SELECT 1 FROM public.persona_section_fields f
    WHERE f.section_id = OLD.id AND f.locked
  ) THEN
    RAISE EXCEPTION 'This section contains fields required by the world persona template'
      USING ERRCODE = 'P0010';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS before_section_delete_guard_locked ON public.persona_sections;
CREATE TRIGGER before_section_delete_guard_locked
  BEFORE DELETE ON public.persona_sections
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_section_delete();
