-- 085_world_tags_limit_serialize.sql
--
-- Le trigger enforce_world_tags_limit (migration 080) fait un count(*) sans
-- verrouillage : deux inserts concurrents sur le même world_id peuvent tous
-- deux voir 9 tags et laisser passer 2 inserts (=> 11 tags). Sérialise les
-- inserts par monde avec un verrou consultatif, même schéma que
-- enforce_persona_limit (migration 056).

CREATE OR REPLACE FUNCTION enforce_world_tags_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(NEW.world_id::text), 1, 16))::bit(64)::bigint
  );
  IF (SELECT count(*) FROM world_tags WHERE world_id = NEW.world_id) >= 10 THEN
    RAISE EXCEPTION 'Un monde ne peut avoir plus de 10 tags.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- (revenir à la version sans verrou de la migration 080)
