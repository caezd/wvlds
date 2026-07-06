-- ============================================================
-- Migration 059 — Remplace la fusion additive par un remplacement complet
-- Le déplacement/duplication d'un persona vers un monde avec fiche par
-- défaut ne fusionne plus champ par champ (verrouillage en place, ajout des
-- champs manquants) : après confirmation explicite du joueur côté UI (voir
-- PersonasView — le dialogue prévient que la fiche sera écrasée), la fiche
-- est entièrement remplacée par une copie fraîche du modèle. La fonction
-- lock_persona_field (058) n'est donc plus utile.
--
-- reset_persona_sections permet ce remplacement : suppression de toutes les
-- sections/champs existants du persona (y compris verrouillés), en
-- contournant les triggers de garde via le même mécanisme (paramètre de
-- session app.bypass_locked_guard) que release_persona_field_locks (057) —
-- ceux-ci sont donc étendus pour respecter le même flag.
-- ============================================================

DROP FUNCTION IF EXISTS public.lock_persona_field(uuid);

CREATE OR REPLACE FUNCTION public.guard_locked_field_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tmpl BOOLEAN;
BEGIN
  IF NOT OLD.locked THEN RETURN OLD; END IF;
  IF current_setting('app.bypass_locked_guard', true) = 'on' THEN RETURN OLD; END IF;
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

CREATE OR REPLACE FUNCTION public.guard_locked_section_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tmpl BOOLEAN;
BEGIN
  IF current_setting('app.bypass_locked_guard', true) = 'on' THEN RETURN OLD; END IF;
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

CREATE OR REPLACE FUNCTION public.reset_persona_sections(p_persona_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.personas
    WHERE id = p_persona_id AND user_id = auth.uid() AND NOT is_template
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.bypass_locked_guard', 'on', true);
  DELETE FROM public.persona_sections WHERE persona_id = p_persona_id;
  PERFORM set_config('app.bypass_locked_guard', 'off', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_persona_sections(uuid) TO authenticated;
