-- 083_persona_marital_status.sql
--
-- Statut marital d'un persona + conjoint optionnel (référence vers un autre
-- persona du même monde). Suit le même schéma minimal que faceclaim
-- (migration 068) : colonnes nullables, pas de valeur par défaut imposée.

ALTER TABLE personas ADD COLUMN IF NOT EXISTS marital_status text;

ALTER TABLE personas ADD CONSTRAINT personas_marital_status_check
  CHECK (marital_status IS NULL OR marital_status IN ('single', 'in_relationship', 'married', 'divorced', 'widowed'));

ALTER TABLE personas ADD COLUMN IF NOT EXISTS spouse_persona_id uuid REFERENCES personas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS personas_spouse_persona_id_idx ON personas (spouse_persona_id);

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS personas_spouse_persona_id_idx;
-- ALTER TABLE personas DROP COLUMN IF EXISTS spouse_persona_id;
-- ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_marital_status_check;
-- ALTER TABLE personas DROP COLUMN IF EXISTS marital_status;
