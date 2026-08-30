-- ============================================================
-- Migration 116 — RLS : auth.uid() évalué une seule fois par requête
-- ============================================================
-- 24 policies appelaient `auth.uid()` directement dans leur expression. Postgres
-- traite alors l'appel comme volatile par ligne : sur un SELECT qui balaie
-- 10 000 lignes, `auth.uid()` est évalué 10 000 fois.
--
-- En l'enveloppant dans `(select auth.uid())`, le planificateur le remonte en
-- InitPlan : évalué UNE fois, puis réutilisé comme constante. La sémantique est
-- identique (auth.uid() est stable sur la durée de la requête), seul le plan
-- change. Gain net sur les tables volumineuses — chat, wiki, tags.
--
-- Les policies sont recréées à l'identique (même cmd, mêmes rôles, même
-- permissivité) : seules les occurrences de `auth.uid()` sont enveloppées.

-- ── challenge_attempts ───────────────────────────────────────
DROP POLICY IF EXISTS "challenge_attempts: owner read" ON public.challenge_attempts;
CREATE POLICY "challenge_attempts: owner read" ON public.challenge_attempts
  FOR SELECT USING (user_id = (select auth.uid()));

-- ── challenges ───────────────────────────────────────────────
DROP POLICY IF EXISTS "challenges: admin write" ON public.challenges;
CREATE POLICY "challenges: admin write" ON public.challenges
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (select auth.uid()) AND profiles.is_admin = true));

DROP POLICY IF EXISTS "challenges: insert own" ON public.challenges;
CREATE POLICY "challenges: insert own" ON public.challenges
  FOR INSERT WITH CHECK (user_id = (select auth.uid()) AND world_id IS NULL);

DROP POLICY IF EXISTS "challenges: member read" ON public.challenges;
CREATE POLICY "challenges: member read" ON public.challenges
  FOR SELECT USING (
    world_id IS NULL
    OR EXISTS (SELECT 1 FROM world_members wm WHERE wm.world_id = challenges.world_id AND wm.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "challenges: read own and global" ON public.challenges;
CREATE POLICY "challenges: read own and global" ON public.challenges
  FOR SELECT USING (user_id IS NULL OR user_id = (select auth.uid()));

-- ── chatroom_follows ─────────────────────────────────────────
DROP POLICY IF EXISTS "users can manage own chatroom follows" ON public.chatroom_follows;
CREATE POLICY "users can manage own chatroom follows" ON public.chatroom_follows
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── persona_marital_requests ─────────────────────────────────
DROP POLICY IF EXISTS "persona_marital_requests: read own" ON public.persona_marital_requests;
CREATE POLICY "persona_marital_requests: read own" ON public.persona_marital_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM personas p WHERE p.id = persona_marital_requests.requester_persona_id AND p.user_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM personas p WHERE p.id = persona_marital_requests.target_persona_id AND p.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "persona_marital_requests: insert as requester" ON public.persona_marital_requests;
CREATE POLICY "persona_marital_requests: insert as requester" ON public.persona_marital_requests
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM personas p WHERE p.id = persona_marital_requests.requester_persona_id AND p.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "persona_marital_requests: delete own" ON public.persona_marital_requests;
CREATE POLICY "persona_marital_requests: delete own" ON public.persona_marital_requests
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM personas p WHERE p.id = persona_marital_requests.requester_persona_id AND p.user_id = (select auth.uid()))
    OR EXISTS (SELECT 1 FROM personas p WHERE p.id = persona_marital_requests.target_persona_id AND p.user_id = (select auth.uid()))
  );

-- ── persona_sections / persona_section_fields ────────────────
DROP POLICY IF EXISTS "sections_select_world_template" ON public.persona_sections;
CREATE POLICY "sections_select_world_template" ON public.persona_sections
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM personas p
      WHERE p.id = persona_sections.persona_id
        AND p.is_template
        AND is_world_member(p.world_id, (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "fields_select_world_template" ON public.persona_section_fields;
CREATE POLICY "fields_select_world_template" ON public.persona_section_fields
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM persona_sections ps
      JOIN personas p ON p.id = ps.persona_id
      WHERE ps.id = persona_section_fields.section_id
        AND p.is_template
        AND is_world_member(p.world_id, (select auth.uid()))
    )
  );

-- ── personas ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "personas_insert_with_capacity" ON public.personas;
CREATE POLICY "personas_insert_with_capacity" ON public.personas
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (select auth.uid())
    AND (
      ((NOT is_template) AND has_persona_capacity((select auth.uid()), world_id))
      OR (is_template AND world_id IS NOT NULL AND is_world_owner_direct(world_id, (select auth.uid())))
    )
  );

-- ── world_lexicon_terms ──────────────────────────────────────
DROP POLICY IF EXISTS "wlt_select" ON public.world_lexicon_terms;
CREATE POLICY "wlt_select" ON public.world_lexicon_terms
  FOR SELECT USING (is_world_member(world_id, (select auth.uid())));

DROP POLICY IF EXISTS "wlt_insert" ON public.world_lexicon_terms;
CREATE POLICY "wlt_insert" ON public.world_lexicon_terms
  FOR INSERT WITH CHECK (is_world_editor(world_id, (select auth.uid())));

DROP POLICY IF EXISTS "wlt_update" ON public.world_lexicon_terms;
CREATE POLICY "wlt_update" ON public.world_lexicon_terms
  FOR UPDATE USING (is_world_editor(world_id, (select auth.uid())));

DROP POLICY IF EXISTS "wlt_delete" ON public.world_lexicon_terms;
CREATE POLICY "wlt_delete" ON public.world_lexicon_terms
  FOR DELETE USING (is_world_editor(world_id, (select auth.uid())));

-- ── world_tags ───────────────────────────────────────────────
DROP POLICY IF EXISTS "world_tags select if member or public" ON public.world_tags;
CREATE POLICY "world_tags select if member or public" ON public.world_tags
  FOR SELECT USING (
    is_world_member(world_id, (select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM worlds w
      WHERE w.id = world_tags.world_id AND w.visibility = 'public' AND w.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "world_tags insert if editor" ON public.world_tags;
CREATE POLICY "world_tags insert if editor" ON public.world_tags
  FOR INSERT WITH CHECK (is_world_editor(world_id, (select auth.uid())));

DROP POLICY IF EXISTS "world_tags delete if editor" ON public.world_tags;
CREATE POLICY "world_tags delete if editor" ON public.world_tags
  FOR DELETE USING (is_world_editor(world_id, (select auth.uid())));

-- ── world_wiki_pages ─────────────────────────────────────────
DROP POLICY IF EXISTS "wwp_select" ON public.world_wiki_pages;
CREATE POLICY "wwp_select" ON public.world_wiki_pages
  FOR SELECT USING (
    is_world_editor(world_id, (select auth.uid()))
    OR (
      is_world_member(world_id, (select auth.uid()))
      AND (is_folder OR published_at IS NOT NULL)
      AND NOT wwp_is_restricted(id)
    )
  );

DROP POLICY IF EXISTS "wwp_insert" ON public.world_wiki_pages;
CREATE POLICY "wwp_insert" ON public.world_wiki_pages
  FOR INSERT WITH CHECK (is_world_editor(world_id, (select auth.uid())));

DROP POLICY IF EXISTS "wwp_update" ON public.world_wiki_pages;
CREATE POLICY "wwp_update" ON public.world_wiki_pages
  FOR UPDATE
  USING (is_world_editor(world_id, (select auth.uid())))
  WITH CHECK (is_world_editor(world_id, (select auth.uid())));

DROP POLICY IF EXISTS "wwp_delete" ON public.world_wiki_pages;
CREATE POLICY "wwp_delete" ON public.world_wiki_pages
  FOR DELETE USING (is_world_editor(world_id, (select auth.uid())));

-- ── world_wiki_page_versions ─────────────────────────────────
DROP POLICY IF EXISTS "wwpv_select" ON public.world_wiki_page_versions;
CREATE POLICY "wwpv_select" ON public.world_wiki_page_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM world_wiki_pages p
      WHERE p.id = world_wiki_page_versions.page_id
        AND is_world_editor(p.world_id, (select auth.uid()))
    )
  );

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Doit renvoyer 0 ligne après application :
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (coalesce(qual,'') ~ '(?<!SELECT )auth\.uid\(\)'
--          OR coalesce(with_check,'') ~ '(?<!SELECT )auth\.uid\(\)');

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Rejouer ce fichier en retirant les `(select ...)` autour de chaque
-- `auth.uid()` : les policies retrouvent leur définition d'origine.
