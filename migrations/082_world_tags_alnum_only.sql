-- 082_world_tags_alnum_only.sql
--
-- Resserre le format des tags de monde : seules les lettres (accents inclus)
-- et les chiffres sont autorisés — ni espaces, ni apostrophes, ni ponctuation
-- ou autres symboles. Remplace la contrainte de 080 (qui ne bloquait que la
-- virgule) par une contrainte alnum complète.

ALTER TABLE world_tags DROP CONSTRAINT IF EXISTS world_tags_format_check;

ALTER TABLE world_tags ADD CONSTRAINT world_tags_format_check
  CHECK (tag = lower(tag) AND char_length(tag) BETWEEN 1 AND 24 AND tag ~ '^[[:alnum:]]+$');

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- ALTER TABLE world_tags DROP CONSTRAINT IF EXISTS world_tags_format_check;
-- ALTER TABLE world_tags ADD CONSTRAINT world_tags_format_check
--   CHECK (tag = lower(tag) AND char_length(tag) BETWEEN 1 AND 24 AND tag !~ ',');
