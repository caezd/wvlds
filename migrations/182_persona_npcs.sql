-- ============================================================
-- Migration 182 — PNJ partagés
-- ============================================================
-- Un persona appartient à son créateur et à lui seul : `owns_persona` dit
-- `user_id = uid`, et toutes les gardes de jeu s'y adossent. Un monde n'avait
-- donc aucun moyen d'avoir un aubergiste, un garde ou une reine que plusieurs
-- membres font parler. Ici :
--
-- ── 1. `personas.is_npc` et deux permissions ─────────────────
-- Un PNJ est un persona du monde (jamais hors monde, jamais un modèle). Il se
-- crée, se modifie et se supprime avec « Gérer les PNJ » (`npc.manage`) ; il
-- se joue avec « Jouer les PNJ » (`npc.play`). Trente PNJ au plus par monde.
--
-- ── 2. Les gardes ────────────────────────────────────────────
-- `owns_persona` (relations, messages, groupes) s'ouvre aux joueurs de PNJ ;
-- `can_edit_persona` (nouvelle) couvre l'écriture : propriétaire, ou
-- gestionnaire pour un PNJ. Les politiques FOR ALL des sections et champs
-- deviennent une politique par action. Un PNJ ne compte pas dans le quota
-- personnel (`has_persona_capacity`, `is_persona_usable`) et naît validé —
-- ses gestionnaires sont de confiance — mais reste soumis à la complétude.
-- `user_id` et `is_npc` ne changent plus après la création (un
-- gestionnaire ne s'approprie pas un PNJ, un joueur ne convertit pas un
-- persona en PNJ pour échapper au quota).

-- ── 1. La colonne et les permissions ─────────────────────────

CREATE OR REPLACE FUNCTION public.world_permission_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    -- Général
    'administrator', 'world.settings', 'roles.manage', 'members.manage',
    -- Salons
    'messages.post', 'chatrooms.create', 'chatrooms.manage', 'categories.manage',
    -- Contenu
    'tabs.edit', 'wiki.edit', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit',
    -- Personas
    'relations.manage', 'personas.review', 'npc.manage', 'npc.play',
    -- Mentions
    'mentions.roles', 'mentions.everyone'
  ]::text[];
$$;

ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS is_npc boolean NOT NULL DEFAULT false;
ALTER TABLE public.personas DROP CONSTRAINT IF EXISTS personas_npc_in_world;
ALTER TABLE public.personas
  ADD CONSTRAINT personas_npc_in_world CHECK (NOT is_npc OR (world_id IS NOT NULL AND NOT is_template));
CREATE INDEX IF NOT EXISTS personas_world_npc_idx ON public.personas (world_id) WHERE is_npc AND deleted_at IS NULL;

-- ── 2. Les gardes ────────────────────────────────────────────

-- Jouer un persona : le sien, ou un PNJ du monde avec `npc.play`.
CREATE OR REPLACE FUNCTION public.owns_persona(pid UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personas p
     WHERE p.id = pid
       AND (p.user_id = uid
            OR (p.is_npc AND public.has_world_permission(p.world_id, uid, 'npc.play')))
  );
$$;

-- Modifier un persona (fiche, sections, champs) : le sien, ou un PNJ du
-- monde avec `npc.manage`.
CREATE OR REPLACE FUNCTION public.can_edit_persona(pid UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personas p
     WHERE p.id = pid
       AND (p.user_id = uid
            OR (p.is_npc AND public.has_world_permission(p.world_id, uid, 'npc.manage')))
  );
$$;
REVOKE ALL ON FUNCTION public.can_edit_persona(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_persona(UUID, UUID) TO authenticated;

-- Le quota personnel ignore les PNJ.
CREATE OR REPLACE FUNCTION public.has_persona_capacity(u uuid, w uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE c INT;
BEGIN
  IF public.is_user_subscribed(u) THEN RETURN TRUE; END IF;
  IF w IS NOT NULL THEN
    SELECT COUNT(*) INTO c FROM public.personas
      WHERE user_id = u AND world_id = w AND NOT is_template AND NOT is_npc;
  ELSE
    SELECT COUNT(*) INTO c FROM public.personas
      WHERE user_id = u AND world_id IS NULL AND NOT is_template AND NOT is_npc;
  END IF;
  RETURN c < 5;
END;
$$;

-- Le plafond : 5 personas par monde en plan gratuit, 30 PNJ par monde.
CREATE OR REPLACE FUNCTION public.enforce_persona_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE c INT;
BEGIN
  IF NEW.is_template THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.world_id IS NOT DISTINCT FROM OLD.world_id THEN
    RETURN NEW;
  END IF;
  IF NEW.is_npc THEN
    PERFORM pg_advisory_xact_lock(('x' || substr(md5(NEW.world_id::text), 1, 16))::bit(64)::bigint);
    SELECT COUNT(*) INTO c FROM public.personas
     WHERE world_id = NEW.world_id AND is_npc AND deleted_at IS NULL AND id <> NEW.id;
    IF c >= 30 THEN
      RAISE EXCEPTION 'NPC limit reached: a world may have at most 30 shared NPCs'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(md5(NEW.user_id::text), 1, 16))::bit(64)::bigint
  );
  IF NOT public.has_persona_capacity(NEW.user_id, NEW.world_id) THEN
    RAISE EXCEPTION 'Persona limit reached: free users may create at most 5 personas per world'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- Jouable : validée et complète ; puis, pour un persona personnel, le quota
-- des 5 plus anciens (090) — un PNJ n'y compte ni ne s'y soumet.
CREATE OR REPLACE FUNCTION public.is_persona_usable(p_persona_id UUID, p_uid UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personas p
     WHERE p.id = p_persona_id AND p.review_status = 'approved' AND p.sheet_complete
  )
  AND (
    EXISTS (SELECT 1 FROM public.personas p WHERE p.id = p_persona_id AND p.is_npc)
    OR public.is_user_subscribed(p_uid)
    OR EXISTS (
      SELECT 1 FROM (
        SELECT id FROM public.personas
        WHERE user_id = p_uid
          AND world_id = (
            SELECT world_id FROM public.personas
            WHERE id = p_persona_id AND user_id = p_uid
          )
          AND NOT is_template
          AND NOT is_npc
        ORDER BY created_at ASC, id ASC
        LIMIT 5
      ) eligible
      WHERE eligible.id = p_persona_id
    )
  );
$$;

-- Un PNJ naît validé (181 : le statut de départ).
DROP FUNCTION IF EXISTS public.persona_initial_review_status(uuid, uuid, boolean);
CREATE OR REPLACE FUNCTION public.persona_initial_review_status(p_world_id uuid, p_user_id uuid, p_is_template boolean, p_is_npc boolean DEFAULT false)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_world_id IS NULL OR p_is_template OR p_is_npc THEN 'approved'
    WHEN public.has_world_permission(p_world_id, p_user_id, 'personas.review') THEN 'approved'
    ELSE 'draft'
  END;
$$;
REVOKE ALL ON FUNCTION public.persona_initial_review_status(uuid, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_personas_review_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.review_status := public.persona_initial_review_status(NEW.world_id, NEW.user_id, NEW.is_template, NEW.is_npc);
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.sheet_complete := NEW.is_template OR NEW.world_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.personas t
      JOIN public.persona_sections ts ON ts.persona_id = t.id
      JOIN public.persona_section_fields tf ON tf.section_id = ts.id AND tf.required
     WHERE t.world_id = NEW.world_id AND t.is_template AND t.deleted_at IS NULL);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_personas_review_insert() FROM PUBLIC, anon, authenticated;

-- La garde d'écriture directe (181) protège aussi `user_id` et `is_npc`.
CREATE OR REPLACE FUNCTION public.tg_personas_review_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.review_status IS DISTINCT FROM OLD.review_status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.sheet_complete IS DISTINCT FROM OLD.sheet_complete THEN
      RAISE EXCEPTION 'La validation d''une fiche passe par submit_persona_for_review / review_persona.';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.is_npc IS DISTINCT FROM OLD.is_npc THEN
      RAISE EXCEPTION 'Le propriétaire et la nature (PNJ) d''un persona ne changent pas.';
    END IF;
  END IF;

  IF NEW.world_id IS DISTINCT FROM OLD.world_id THEN
    NEW.review_status := public.persona_initial_review_status(NEW.world_id, NEW.user_id, NEW.is_template, NEW.is_npc);
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.sheet_complete := NEW.is_template OR NEW.world_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.personas t
        JOIN public.persona_sections ts ON ts.persona_id = t.id
        JOIN public.persona_section_fields tf ON tf.section_id = ts.id AND tf.required
       WHERE t.world_id = NEW.world_id AND t.is_template AND t.deleted_at IS NULL);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_personas_review_guard() FROM PUBLIC, anon, authenticated;

-- Les RPC de fiche (057/059/181) suivent `can_edit_persona`.
CREATE OR REPLACE FUNCTION public.release_persona_field_locks(p_persona_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.personas WHERE id = p_persona_id AND NOT is_template)
     OR NOT public.can_edit_persona(p_persona_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.bypass_locked_guard', 'on', true);
  UPDATE public.persona_section_fields f
  SET locked = false, required = false, template_field_id = NULL
  FROM public.persona_sections s
  WHERE f.section_id = s.id AND s.persona_id = p_persona_id AND (f.locked OR f.template_field_id IS NOT NULL);
  PERFORM set_config('app.bypass_locked_guard', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_persona_sections(p_persona_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.personas WHERE id = p_persona_id AND NOT is_template)
     OR NOT public.can_edit_persona(p_persona_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.bypass_locked_guard', 'on', true);
  DELETE FROM public.persona_sections WHERE persona_id = p_persona_id;
  PERFORM set_config('app.bypass_locked_guard', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_persona_template_fields(p_persona_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_world    uuid;
  v_template uuid;
  v_field    record;
  v_section  uuid;
  v_pos      integer;
  v_count    integer := 0;
BEGIN
  SELECT p.world_id INTO v_world FROM public.personas p
   WHERE p.id = p_persona_id AND NOT p.is_template AND p.deleted_at IS NULL
     AND public.can_edit_persona(p.id, v_uid);
  IF NOT FOUND THEN RAISE EXCEPTION 'Persona introuvable.'; END IF;
  IF v_world IS NULL THEN RETURN 0; END IF;

  SELECT t.id INTO v_template FROM public.personas t
   WHERE t.world_id = v_world AND t.is_template AND t.deleted_at IS NULL LIMIT 1;
  IF v_template IS NULL THEN RETURN 0; END IF;

  FOR v_field IN
    SELECT tf.id, tf.type, tf.label, tf.locked, tf.required, tf.data, ts.name AS section_name, ts.position AS section_position
      FROM public.persona_sections ts
      JOIN public.persona_section_fields tf ON tf.section_id = ts.id
     WHERE ts.persona_id = v_template AND (tf.locked OR tf.required)
       AND NOT EXISTS (
         SELECT 1 FROM public.persona_section_fields f
           JOIN public.persona_sections s ON s.id = f.section_id
          WHERE s.persona_id = p_persona_id AND f.template_field_id = tf.id)
     ORDER BY ts.position, tf.position
  LOOP
    SELECT s.id INTO v_section FROM public.persona_sections s
     WHERE s.persona_id = p_persona_id AND s.name = v_field.section_name
     ORDER BY s.position LIMIT 1;
    IF v_section IS NULL THEN
      SELECT coalesce(max(s.position), -1) + 1 INTO v_pos FROM public.persona_sections s WHERE s.persona_id = p_persona_id;
      INSERT INTO public.persona_sections (persona_id, name, position)
      VALUES (p_persona_id, v_field.section_name, v_pos) RETURNING id INTO v_section;
    END IF;
    SELECT coalesce(max(f.position), -1) + 1 INTO v_pos FROM public.persona_section_fields f WHERE f.section_id = v_section;
    INSERT INTO public.persona_section_fields (section_id, type, label, position, locked, required, template_field_id, data)
    VALUES (
      v_section, v_field.type, v_field.label, v_pos, v_field.locked, v_field.required, v_field.id,
      CASE v_field.type
        WHEN 'title'      THEN v_field.data
        WHEN 'separator'  THEN '{}'::jsonb
        WHEN 'stats'      THEN '{"items": []}'::jsonb
        WHEN 'image-grid' THEN '{"images": []}'::jsonb
        WHEN 'inventory'  THEN '{"inventoryItems": []}'::jsonb
        WHEN 'skills'     THEN '{"skillItems": []}'::jsonb
        WHEN 'gauges'     THEN '{"gaugeItems": []}'::jsonb
        WHEN 'quote'      THEN '{"quoteText": "", "quoteSource": ""}'::jsonb
        WHEN 'traits'     THEN '{"traitItems": []}'::jsonb
        WHEN 'timeline'   THEN '{"timelineItems": []}'::jsonb
        WHEN 'dl'         THEN '{"dlItems": []}'::jsonb
        ELSE '{"text": "", "format": "markdown"}'::jsonb
      END
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.persona_required_fields(p_persona_id uuid)
RETURNS TABLE(template_field_id uuid, section_name text, field_type text, field_label text, field_id uuid, section_id uuid, filled boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tf.id, ts.name, tf.type, tf.label, f.id, f.section_id,
         coalesce(public.persona_field_has_value(f.type, f.data), false)
    FROM public.personas p
    JOIN public.personas t ON t.world_id = p.world_id AND t.is_template AND t.deleted_at IS NULL
    JOIN public.persona_sections ts ON ts.persona_id = t.id
    JOIN public.persona_section_fields tf ON tf.section_id = ts.id AND tf.required
    LEFT JOIN LATERAL (
      SELECT pf.id, pf.section_id, pf.type, pf.data
        FROM public.persona_section_fields pf
        JOIN public.persona_sections ps ON ps.id = pf.section_id
       WHERE ps.persona_id = p.id AND pf.template_field_id = tf.id
       ORDER BY public.persona_field_has_value(pf.type, pf.data) DESC, ps.position, pf.position
       LIMIT 1
    ) f ON true
   WHERE p.id = p_persona_id AND NOT p.is_template
     AND (public.can_edit_persona(p.id, auth.uid()) OR public.is_world_member(p.world_id, auth.uid()))
   ORDER BY ts.position, tf.position
$$;

-- ── 3. Les politiques ────────────────────────────────────────

-- personas : créer un PNJ avec `npc.manage` (le créateur reste `user_id`) ;
-- le modifier ou le supprimer de même.
DROP POLICY IF EXISTS "personas_insert_with_capacity" ON public.personas;
CREATE POLICY "personas_insert_with_capacity" ON public.personas FOR INSERT TO authenticated WITH CHECK (
  user_id = (select auth.uid())
  AND (
    (NOT is_template AND NOT is_npc AND public.has_persona_capacity((select auth.uid()), world_id))
    OR (is_template AND world_id IS NOT NULL AND public.is_world_owner_direct(world_id, (select auth.uid())))
    OR (is_npc AND world_id IS NOT NULL AND public.has_world_permission(world_id, (select auth.uid()), 'npc.manage'))
  )
);
DROP POLICY IF EXISTS "personas_update_own" ON public.personas;
CREATE POLICY "personas_update_own" ON public.personas FOR UPDATE TO authenticated USING (
  user_id = (select auth.uid())
  OR (is_npc AND public.has_world_permission(world_id, (select auth.uid()), 'npc.manage'))
) WITH CHECK (
  user_id = (select auth.uid())
  OR (is_npc AND public.has_world_permission(world_id, (select auth.uid()), 'npc.manage'))
);
DROP POLICY IF EXISTS "personas_delete_own" ON public.personas;
CREATE POLICY "personas_delete_own" ON public.personas FOR DELETE TO authenticated USING (
  user_id = (select auth.uid())
  OR (is_npc AND public.has_world_permission(world_id, (select auth.uid()), 'npc.manage'))
);

-- persona_sections : une politique par action, ouverte aux gestionnaires de PNJ.
DROP POLICY IF EXISTS "sections: owner full access" ON public.persona_sections;
CREATE POLICY "sections_select_editor" ON public.persona_sections FOR SELECT TO authenticated USING (
  public.can_edit_persona(persona_id, (select auth.uid()))
);
CREATE POLICY "sections_insert_editor" ON public.persona_sections FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_persona(persona_id, (select auth.uid()))
);
CREATE POLICY "sections_update_editor" ON public.persona_sections FOR UPDATE TO authenticated USING (
  public.can_edit_persona(persona_id, (select auth.uid()))
) WITH CHECK (
  public.can_edit_persona(persona_id, (select auth.uid()))
);
CREATE POLICY "sections_delete_editor" ON public.persona_sections FOR DELETE TO authenticated USING (
  public.can_edit_persona(persona_id, (select auth.uid()))
);

-- persona_section_fields : idem, par la section.
DROP POLICY IF EXISTS "section_fields: owner full access" ON public.persona_section_fields;
CREATE POLICY "fields_select_editor" ON public.persona_section_fields FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.persona_sections s
           WHERE s.id = persona_section_fields.section_id
             AND public.can_edit_persona(s.persona_id, (select auth.uid())))
);
CREATE POLICY "fields_insert_editor" ON public.persona_section_fields FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.persona_sections s
           WHERE s.id = persona_section_fields.section_id
             AND public.can_edit_persona(s.persona_id, (select auth.uid())))
);
CREATE POLICY "fields_update_editor" ON public.persona_section_fields FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.persona_sections s
           WHERE s.id = persona_section_fields.section_id
             AND public.can_edit_persona(s.persona_id, (select auth.uid())))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.persona_sections s
           WHERE s.id = persona_section_fields.section_id
             AND public.can_edit_persona(s.persona_id, (select auth.uid())))
);
CREATE POLICY "fields_delete_editor" ON public.persona_section_fields FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.persona_sections s
           WHERE s.id = persona_section_fields.section_id
             AND public.can_edit_persona(s.persona_id, (select auth.uid())))
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('persona_sections','persona_section_fields') ORDER BY 1;
--   → plus aucun cmd = ALL ; select/insert/update/delete « _editor » + les deux lectures (modèle, membres).
-- En tant que gestionnaire : INSERT INTO personas (user_id, name, world_id, is_npc) VALUES (moi, 'Aubergiste', <monde>, true);
--   → review_status = 'approved' ; un joueur avec `npc.play` : SELECT owns_persona(<pnj>, lui) → true ; sans : false.
-- UPDATE personas SET is_npc = false WHERE id = <pnj>; → exception.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Rejouer les politiques FOR ALL de la 001 (sections, champs) et les trois
-- politiques personas de la 180/116 ; owns_persona (173), is_persona_usable,
-- persona_initial_review_status et les déclencheurs (181), has_persona_capacity
-- (054), enforce_persona_limit (056), release/reset (057/059/181) ;
-- DROP FUNCTION can_edit_persona ; ALTER TABLE personas DROP COLUMN is_npc ;
-- world_permission_keys (181).
