-- 038_rls_initplan_optimization.sql
--
-- Performance RLS : enveloppe les appels `auth.uid()` / `auth.role()` /
-- `auth.jwt()` *nus* des policies dans un sous-select `(select auth.x())`.
--
-- Pourquoi : un appel nu est marqué VOLATILE dans le contexte d'une policy et
-- Postgres le ré-évalue *à chaque ligne* scannée. Enveloppé dans un sous-select,
-- il devient un InitPlan évalué *une seule fois* par requête. C'est la
-- correction recommandée par l'advisor `auth_rls_initplan` (105 occurrences).
--
-- Garanties :
--   * Réécriture purement technique : la sémantique (et donc la sécurité) des
--     policies est strictement inchangée — seul le moment d'évaluation change.
--   * Idempotent : une policy déjà enveloppée est ignorée (garde `select auth.`),
--     donc ré-exécuter la migration ne double-wrappe rien.
--
-- Rollback : voir le bloc commenté en fin de fichier (transformation inverse).

DO $$
DECLARE
  r        record;
  v_using  text;
  v_check  text;
  v_sql    text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ~ 'auth\.(uid|role|jwt)\(\)'
           OR with_check ~ 'auth\.(uid|role|jwt)\(\)')
      -- Idempotence : ne pas retoucher une policy déjà enveloppée.
      AND coalesce(qual, '')       !~* 'select\s+auth\.'
      AND coalesce(with_check, '') !~* 'select\s+auth\.'
  LOOP
    v_using := regexp_replace(r.qual,       'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    v_check := regexp_replace(r.with_check, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');

    v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF r.qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_using);
    END IF;
    IF r.with_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;

    EXECUTE v_sql;
  END LOOP;
END $$;

-- ── Rollback (à exécuter manuellement si besoin) ───────────────────────────
-- Transformation inverse : retire le sous-select autour des appels auth.*.
--
-- DO $$
-- DECLARE r record; v_using text; v_check text; v_sql text;
-- BEGIN
--   FOR r IN
--     SELECT schemaname, tablename, policyname, qual, with_check
--     FROM pg_policies
--     WHERE schemaname = 'public'
--       AND (qual ~* 'select\s+auth\.(uid|role|jwt)\(\)'
--            OR with_check ~* 'select\s+auth\.(uid|role|jwt)\(\)')
--   LOOP
--     v_using := regexp_replace(r.qual,       '\(\s*select\s+(auth\.(uid|role|jwt)\(\))\s*\)', '\1', 'gi');
--     v_check := regexp_replace(r.with_check, '\(\s*select\s+(auth\.(uid|role|jwt)\(\))\s*\)', '\1', 'gi');
--     v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
--     IF r.qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_using); END IF;
--     IF r.with_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
--     EXECUTE v_sql;
--   END LOOP;
-- END $$;
