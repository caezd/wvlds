-- 080_world_tags_db_constraints.sql
--
-- Défense en profondeur pour world_tags : la policy RLS d'insertion autorise
-- tout éditeur du monde, indépendamment des règles appliquées côté server
-- action (addWorldTag dans app/actions/worldCatalog.ts). On garantit donc en
-- base le format attendu par l'app (minuscules, 1-24 caractères, pas de
-- virgule — séparateur utilisé dans le paramètre d'URL `tags` de /explore)
-- et la limite de 10 tags par monde.

ALTER TABLE world_tags ADD CONSTRAINT world_tags_format_check
  CHECK (tag = lower(tag) AND char_length(tag) BETWEEN 1 AND 24 AND tag !~ ',');

CREATE OR REPLACE FUNCTION enforce_world_tags_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM world_tags WHERE world_id = NEW.world_id) >= 10 THEN
    RAISE EXCEPTION 'Un monde ne peut avoir plus de 10 tags.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER world_tags_limit_trigger
  BEFORE INSERT ON world_tags
  FOR EACH ROW EXECUTE FUNCTION enforce_world_tags_limit();

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS world_tags_limit_trigger ON world_tags;
-- DROP FUNCTION IF EXISTS enforce_world_tags_limit();
-- ALTER TABLE world_tags DROP CONSTRAINT IF EXISTS world_tags_format_check;
