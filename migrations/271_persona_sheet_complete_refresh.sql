-- ============================================================
-- Migration 271 — `sheet_complete` suit la fiche par défaut du monde
-- ============================================================
-- BOGUE CORRIGÉ. `personas.sheet_complete` est une colonne tenue à jour
-- par des déclencheurs (181, 191) ; `is_persona_usable` (politique
-- d'insertion de `chat_messages`) et le cadenas du sélecteur de persona la
-- lisent telle quelle. Or rien ne la recalculait quand la fiche par défaut
-- elle-même changeait :
--
--   - « Fiche par défaut » décochée : `setWorldPersonaTemplate` supprime le
--     persona modèle. Ses sections partent en cascade, mais leur déclencheur
--     ne retrouve plus le persona (déjà supprimé) et ne fait rien. Les
--     fiches restaient « incomplètes » vis-à-vis d'un modèle disparu :
--     71 personas bloqués en prod le 2026-11-26, l'envoi d'un message
--     échouant sur « new row violates row-level security policy for table
--     chat_messages ».
--   - Un modèle mis en corbeille (`deleted_at`), dé-templaté, ou créé.
--   - Un persona qui naît ou change de monde : le calcul BEFORE (181, 260)
--     ne regarde que les champs du modèle et oublie le faceclaim exigé (191).
--
-- Les autres causes avaient déjà leur déclencheur : champ du modèle ajouté,
-- retiré ou `required` basculé (181), section supprimée (181),
-- `require_faceclaim` / `enable_faceclaims` (191).
--
-- Pourquoi garder la colonne plutôt que d'appeler `persona_sheet_is_complete`
-- dans `is_persona_usable` : le client lit `sheet_complete` pour le cadenas
-- et les badges ; un calcul à la lecture côté base seulement les ferait
-- diverger. La colonne reste donc la seule vérité, recalculée à chaque cause.

-- ── 1. Le déclencheur ────────────────────────────────────────
-- AFTER : sur une suppression, le modèle n'existe plus quand on recalcule ;
-- sur une insertion, la ligne existe pour `persona_sheet_is_complete`.
-- La liste UPDATE OF exclut `sheet_complete` : le recalcul ne le relance pas.
CREATE OR REPLACE FUNCTION public.tg_personas_sheet_complete_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_template AND OLD.world_id IS NOT NULL THEN
      PERFORM public.refresh_world_sheets_complete(OLD.world_id);
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_template THEN
      IF NEW.world_id IS NOT NULL THEN
        PERFORM public.refresh_world_sheets_complete(NEW.world_id);
      END IF;
    ELSIF NEW.world_id IS NOT NULL THEN
      PERFORM public.refresh_persona_sheet_complete(NEW.id);
    END IF;
    RETURN NULL;
  END IF;

  -- UPDATE de is_template, deleted_at ou world_id.
  IF NEW.is_template IS NOT DISTINCT FROM OLD.is_template
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
     AND NEW.world_id IS NOT DISTINCT FROM OLD.world_id THEN
    RETURN NULL;
  END IF;

  IF OLD.is_template OR NEW.is_template THEN
    -- Le modèle d'un monde change : toutes ses fiches, ancien et nouveau monde.
    IF OLD.world_id IS NOT NULL THEN
      PERFORM public.refresh_world_sheets_complete(OLD.world_id);
    END IF;
    IF NEW.world_id IS NOT NULL AND NEW.world_id IS DISTINCT FROM OLD.world_id THEN
      PERFORM public.refresh_world_sheets_complete(NEW.world_id);
    END IF;
  ELSIF NEW.world_id IS NOT NULL AND NEW.world_id IS DISTINCT FROM OLD.world_id THEN
    -- Un persona arrive dans un monde : la règle entière, faceclaim compris.
    PERFORM public.refresh_persona_sheet_complete(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_personas_sheet_complete_template() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_personas_sheet_complete_template ON public.personas;
CREATE TRIGGER trg_personas_sheet_complete_template
  AFTER INSERT OR DELETE OR UPDATE OF is_template, deleted_at, world_id ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.tg_personas_sheet_complete_template();

-- ── 2. Rattrapage ────────────────────────────────────────────
-- Toutes les fiches actives d'après la règle ; le bogue n'a laissé que des
-- `false` à tort, mais on recalcule dans les deux sens.
UPDATE public.personas p
   SET sheet_complete = public.persona_sheet_is_complete(p.id)
 WHERE NOT p.is_template AND p.deleted_at IS NULL AND p.world_id IS NOT NULL
   AND p.sheet_complete IS DISTINCT FROM public.persona_sheet_is_complete(p.id);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Plus aucun écart entre la colonne et la règle :
-- SELECT count(*) FROM public.personas p
--  WHERE NOT p.is_template AND p.deleted_at IS NULL AND p.world_id IS NOT NULL
--    AND p.sheet_complete IS DISTINCT FROM public.persona_sheet_is_complete(p.id);  -- → 0
--
-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS trg_personas_sheet_complete_template ON public.personas;
-- DROP FUNCTION IF EXISTS public.tg_personas_sheet_complete_template();
-- (le rattrapage ne se défait pas : il remet la colonne d'accord avec la règle)
