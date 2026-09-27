-- ─────────────────────────────────────────────────────────────
-- Migration 191 — Le faceclaim peut être exigé sur une fiche
--
-- `worlds.enable_faceclaims` dit si un monde se sert des faceclaims ;
-- `worlds.require_faceclaim` dit, en plus, qu'une fiche sans faceclaim n'est
-- pas terminée. La règle rejoint donc celle des champs obligatoires du modèle
-- (migration 181) : `persona_sheet_is_complete` en tient compte, et
-- `is_persona_usable` exige toujours une fiche complète — un persona sans
-- faceclaim ne pourra donc pas jouer dans un monde qui l'exige.
--
-- L'option ne vaut que si le monde se sert des faceclaims : décocher
-- `enable_faceclaims` lève l'exigence sans avoir à décocher les deux.
--
-- Deux déclencheurs de plus, car `sheet_complete` est une colonne tenue à
-- jour et non un calcul à la lecture : écrire un faceclaim recalcule la fiche,
-- changer l'une des deux options du monde recalcule tous ses personas.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS require_faceclaim boolean NOT NULL DEFAULT false;

-- ── 1. La complétude d'une fiche ─────────────────────────────
CREATE OR REPLACE FUNCTION public.persona_sheet_is_complete(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    -- Les champs obligatoires du modèle, tous remplis.
    NOT EXISTS (
      SELECT 1
        FROM public.personas p
        JOIN public.personas t ON t.world_id = p.world_id AND t.is_template AND t.deleted_at IS NULL
        JOIN public.persona_sections ts ON ts.persona_id = t.id
        JOIN public.persona_section_fields tf ON tf.section_id = ts.id AND tf.required
       WHERE p.id = p_persona_id AND NOT p.is_template
         AND NOT EXISTS (
           SELECT 1
             FROM public.persona_section_fields f
             JOIN public.persona_sections s ON s.id = f.section_id
            WHERE s.persona_id = p.id
              AND f.template_field_id = tf.id
              AND public.persona_field_has_value(f.type, f.data)
         )
    )
    -- Et le faceclaim, quand le monde l'exige.
    AND NOT EXISTS (
      SELECT 1
        FROM public.personas p
        JOIN public.worlds w ON w.id = p.world_id
       WHERE p.id = p_persona_id AND NOT p.is_template
         AND w.require_faceclaim AND w.enable_faceclaims
         AND coalesce(btrim(p.faceclaim), '') = ''
    );
$$;

-- ── 2. Le recalcul suit le faceclaim ─────────────────────────
CREATE OR REPLACE FUNCTION public.tg_persona_faceclaim_sheet_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.world_id IS NOT NULL AND NOT NEW.is_template THEN
    PERFORM public.refresh_persona_sheet_complete(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_persona_faceclaim_sheet_complete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_persona_faceclaim_sheet_complete ON public.personas;
CREATE TRIGGER trg_persona_faceclaim_sheet_complete
  AFTER UPDATE OF faceclaim ON public.personas
  FOR EACH ROW
  WHEN (OLD.faceclaim IS DISTINCT FROM NEW.faceclaim)
  EXECUTE FUNCTION public.tg_persona_faceclaim_sheet_complete();

-- ── 3. Et les deux options du monde ──────────────────────────
CREATE OR REPLACE FUNCTION public.tg_world_faceclaim_sheets_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.refresh_world_sheets_complete(NEW.id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_faceclaim_sheets_complete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_world_faceclaim_sheets_complete ON public.worlds;
CREATE TRIGGER trg_world_faceclaim_sheets_complete
  AFTER UPDATE OF require_faceclaim, enable_faceclaims ON public.worlds
  FOR EACH ROW
  WHEN (OLD.require_faceclaim IS DISTINCT FROM NEW.require_faceclaim
        OR OLD.enable_faceclaims IS DISTINCT FROM NEW.enable_faceclaims)
  EXECUTE FUNCTION public.tg_world_faceclaim_sheets_complete();

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Aucune fiche ne change tant qu'aucun monde n'exige de faceclaim :
-- SELECT count(*) FROM public.personas WHERE NOT sheet_complete;   -- → inchangé
-- SELECT count(*) FROM public.worlds WHERE require_faceclaim;      -- → 0
