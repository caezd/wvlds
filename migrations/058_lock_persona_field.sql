-- ============================================================
-- Migration 058 — Verrouillage en place d'un champ existant
-- ensureTemplateFields (application de la fiche par défaut d'un monde à
-- l'entrée d'un persona) doit pouvoir marquer `locked = true` sur un champ
-- que le joueur possède déjà (même section, même type), plutôt que d'ajouter
-- un champ verrouillé en doublon à côté du sien. Même contournement que
-- release_persona_field_locks (057) : bypass étroit du trigger de garde,
-- après vérification de propriété.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lock_persona_field(p_field_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.persona_section_fields f
    JOIN public.persona_sections s ON s.id = f.section_id
    JOIN public.personas p ON p.id = s.persona_id
    WHERE f.id = p_field_id AND p.user_id = auth.uid() AND NOT p.is_template
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.bypass_locked_guard', 'on', true);
  UPDATE public.persona_section_fields SET locked = true WHERE id = p_field_id;
  PERFORM set_config('app.bypass_locked_guard', 'off', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_persona_field(uuid) TO authenticated;
