-- ============================================================
-- Migration 057 — Libération des verrous au déplacement d'un persona
-- Les verrous de champs (055) n'ont de sens que vis-à-vis du monde
-- d'origine d'un persona : un déplacement vers un autre monde doit les
-- libérer (movePersona réapplique ensuite le verrou du monde cible s'il
-- existe, côté application — voir ensureTemplateFields dans actions.ts).
--
-- Le trigger guard_locked_field_update empêche normalement toute
-- modification de `locked` hors persona modèle — c'est le but recherché
-- (empêcher un joueur de déverrouiller lui-même un champ requis). On
-- ajoute un contournement étroit, activé uniquement par la fonction
-- release_persona_field_locks ci-dessous après vérification explicite de
-- la propriété du persona, via un paramètre de session dédié (namespace
-- "app.", donc réglable par n'importe quel rôle sans privilège spécial —
-- contrairement à session_replication_role qui exige un rôle superuser).
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_locked_field_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE tmpl BOOLEAN;
BEGIN
  IF NEW.locked IS NOT DISTINCT FROM OLD.locked THEN RETURN NEW; END IF;
  IF current_setting('app.bypass_locked_guard', true) = 'on' THEN RETURN NEW; END IF;
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

CREATE OR REPLACE FUNCTION public.release_persona_field_locks(p_persona_id uuid)
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
  UPDATE public.persona_section_fields f
  SET locked = false
  FROM public.persona_sections s
  WHERE f.section_id = s.id AND s.persona_id = p_persona_id AND f.locked;
  PERFORM set_config('app.bypass_locked_guard', 'off', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_persona_field_locks(uuid) TO authenticated;
