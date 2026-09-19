-- ============================================================
-- Migration 181 — Champs obligatoires du modèle et validation des fiches
-- ============================================================
-- Le modèle de fiche d'un monde (054) impose la présence de champs
-- (`locked`), jamais leur remplissage. Et n'importe quel persona joue dès sa
-- création : aucun regard d'un administrateur. Ici :
--
-- ── 1. `personas.review` ─────────────────────────────────────
-- Une permission de plus dans `world_permission_keys()` ; le rôle
-- « Administrateur » seedé (`administrator`) la porte déjà.
--
-- ── 2. Champs obligatoires ───────────────────────────────────
-- `persona_section_fields.required` (modèle seulement, comme `locked`, et
-- toujours verrouillé : un champ à remplir doit d'abord exister) et
-- `template_field_id`, le lien de chaque champ d'un joueur vers le champ du
-- modèle dont il est la copie — posé à la copie, rétabli ici pour l'existant
-- par correspondance (section, type, position). `persona_sheet_is_complete`
-- dit si chaque champ obligatoire du modèle a, sur la fiche, un champ lié qui
-- porte une valeur (`persona_field_has_value` selon le type) ; des
-- déclencheurs tiennent `personas.sheet_complete` à jour, sur la fiche comme
-- sur le modèle (un champ rendu obligatoire recalcule tout le monde).
-- `sync_persona_template_fields` ajoute à une fiche les champs du modèle qui
-- lui manquent (un champ rendu obligatoire après coup, par exemple).
--
-- ── 3. Validation ────────────────────────────────────────────
-- `personas.review_status` : brouillon → soumise → validée. L'existant est
-- validé par la migration ; ensuite tout nouveau persona naît brouillon,
-- sauf si son créateur a `personas.review` (ou hors monde : rien à valider).
-- Changer de monde remet en brouillon. `submit_persona_for_review` (le
-- propriétaire, fiche complète) et `review_persona` (un relecteur : valide ou
-- renvoie, avec un commentaire dans `persona_review_comments`). Ces colonnes
-- ne s'écrivent que par là — un déclencheur SECURITY INVOKER refuse l'écriture
-- directe. `is_persona_usable` exige désormais validée ET complète.
--
-- ── 4. Deux notifications ────────────────────────────────────
-- `persona_submitted` (aux relecteurs) et `persona_reviewed` (au
-- propriétaire), avec la fonction Edge de push à redéployer.
--
-- ── 5. Lecture des fiches ────────────────────────────────────
-- Les sections et champs d'un persona n'étaient lisibles que par son
-- propriétaire (et ceux du modèle, par les membres) : la fiche d'un autre
-- joueur s'ouvrait vide, et un relecteur n'aurait rien à relire. Les membres
-- du monde lisent désormais les fiches des personas du monde.

-- ── 1. La permission ─────────────────────────────────────────

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
    'relations.manage', 'personas.review',
    -- Mentions
    'mentions.roles', 'mentions.everyone'
  ]::text[];
$$;

-- ── 2. Champs obligatoires ───────────────────────────────────

ALTER TABLE public.persona_section_fields
  ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS template_field_id uuid REFERENCES public.persona_section_fields(id) ON DELETE SET NULL;
ALTER TABLE public.persona_section_fields DROP CONSTRAINT IF EXISTS persona_section_fields_required_locked;
ALTER TABLE public.persona_section_fields
  ADD CONSTRAINT persona_section_fields_required_locked CHECK (NOT required OR locked);
CREATE INDEX IF NOT EXISTS persona_section_fields_template_field_idx
  ON public.persona_section_fields (template_field_id) WHERE template_field_id IS NOT NULL;

-- Reprise de l'existant : un champ d'un joueur correspond au champ du modèle
-- de son monde qui a la même section (nom), le même type et la même position.
UPDATE public.persona_section_fields f
   SET template_field_id = tf.id
  FROM public.persona_sections s
  JOIN public.personas p ON p.id = s.persona_id AND NOT p.is_template AND p.world_id IS NOT NULL
  JOIN public.personas t ON t.world_id = p.world_id AND t.is_template AND t.deleted_at IS NULL
  JOIN public.persona_sections ts ON ts.persona_id = t.id AND ts.name = s.name
  JOIN public.persona_section_fields tf ON tf.section_id = ts.id
 WHERE f.section_id = s.id AND tf.type = f.type AND tf.position = f.position
   AND f.template_field_id IS NULL;

-- `locked` et `required` ne changent que sur un modèle (remplace la garde de
-- la 055/057, qui ne connaissait que `locked` ; la dérogation
-- `app.bypass_locked_guard` des RPC de déplacement reste honorée).
CREATE OR REPLACE FUNCTION public.guard_locked_field_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE tmpl BOOLEAN;
BEGIN
  IF NEW.locked IS NOT DISTINCT FROM OLD.locked AND NEW.required IS NOT DISTINCT FROM OLD.required THEN
    RETURN NEW;
  END IF;
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

-- Libérer les verrous d'une fiche qui change de monde (057) : un champ
-- obligatoire est verrouillé par contrainte, l'obligation tombe avec lui.
CREATE OR REPLACE FUNCTION public.release_persona_field_locks(p_persona_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  SET locked = false, required = false, template_field_id = NULL
  FROM public.persona_sections s
  WHERE f.section_id = s.id AND s.persona_id = p_persona_id AND (f.locked OR f.template_field_id IS NOT NULL);
  PERFORM set_config('app.bypass_locked_guard', 'off', true);
END;
$$;

-- Le lien vers le modèle ne vise qu'un champ d'un modèle du même monde.
CREATE OR REPLACE FUNCTION public.tg_persona_field_template_link()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.template_field_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.template_field_id IS NOT DISTINCT FROM OLD.template_field_id THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.persona_sections s
      JOIN public.personas p ON p.id = s.persona_id
      JOIN public.persona_section_fields tf ON tf.id = NEW.template_field_id
      JOIN public.persona_sections ts ON ts.id = tf.section_id
      JOIN public.personas t ON t.id = ts.persona_id
     WHERE s.id = NEW.section_id AND t.is_template AND t.world_id = p.world_id
  ) THEN
    RAISE EXCEPTION 'Le champ lié doit appartenir au modèle du même monde.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_persona_field_template_link() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_persona_field_template_link ON public.persona_section_fields;
CREATE TRIGGER trg_persona_field_template_link
  BEFORE INSERT OR UPDATE OF template_field_id ON public.persona_section_fields
  FOR EACH ROW EXECUTE FUNCTION public.tg_persona_field_template_link();

-- Un champ porte-t-il une valeur ? Le titre et le séparateur n'en ont pas et
-- ne comptent jamais ; le texte se juge sur `data.text`, la citation sur
-- `data.quoteText`, les autres types sur leur tableau d'éléments (mêmes clés
-- que `SectionFieldsEditor`, côté client).
CREATE OR REPLACE FUNCTION public.persona_field_has_value(p_type text, p_data jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_type
    WHEN 'title'      THEN true
    WHEN 'separator'  THEN true
    WHEN 'text'       THEN btrim(coalesce(p_data->>'text', '')) <> ''
    WHEN 'input'      THEN btrim(coalesce(p_data->>'text', '')) <> ''
    WHEN 'textarea'   THEN btrim(coalesce(p_data->>'text', '')) <> ''
    WHEN 'quote'      THEN btrim(coalesce(p_data->>'quoteText', '')) <> ''
    WHEN 'stats'      THEN jsonb_typeof(p_data->'items') = 'array' AND jsonb_array_length(p_data->'items') > 0
    WHEN 'image-grid' THEN jsonb_typeof(p_data->'images') = 'array' AND jsonb_array_length(p_data->'images') > 0
    WHEN 'inventory'  THEN jsonb_typeof(p_data->'inventoryItems') = 'array' AND jsonb_array_length(p_data->'inventoryItems') > 0
    WHEN 'skills'     THEN jsonb_typeof(p_data->'skillItems') = 'array' AND jsonb_array_length(p_data->'skillItems') > 0
    WHEN 'gauges'     THEN jsonb_typeof(p_data->'gaugeItems') = 'array' AND jsonb_array_length(p_data->'gaugeItems') > 0
    WHEN 'traits'     THEN jsonb_typeof(p_data->'traitItems') = 'array' AND jsonb_array_length(p_data->'traitItems') > 0
    WHEN 'timeline'   THEN jsonb_typeof(p_data->'timelineItems') = 'array' AND jsonb_array_length(p_data->'timelineItems') > 0
    WHEN 'dl'         THEN jsonb_typeof(p_data->'dlItems') = 'array' AND jsonb_array_length(p_data->'dlItems') > 0
    ELSE true
  END;
$$;

-- Les champs obligatoires du modèle d'un monde et, pour un persona, l'état
-- de chacun sur sa fiche : lié et rempli, lié mais vide, ou absent.
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
     AND (p.user_id = auth.uid() OR public.is_world_member(p.world_id, auth.uid()))
   ORDER BY ts.position, tf.position
$$;
REVOKE ALL ON FUNCTION public.persona_required_fields(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.persona_required_fields(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.persona_sheet_is_complete(p_persona_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NOT EXISTS (
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
  );
$$;
REVOKE ALL ON FUNCTION public.persona_sheet_is_complete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.persona_sheet_is_complete(uuid) TO authenticated;

ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS sheet_complete boolean NOT NULL DEFAULT true;

-- Le recalcul, réservé aux déclencheurs.
CREATE OR REPLACE FUNCTION public.refresh_persona_sheet_complete(p_persona_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.personas p
     SET sheet_complete = public.persona_sheet_is_complete(p.id)
   WHERE p.id = p_persona_id
     AND p.sheet_complete IS DISTINCT FROM public.persona_sheet_is_complete(p.id);
$$;
REVOKE ALL ON FUNCTION public.refresh_persona_sheet_complete(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_world_sheets_complete(p_world_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.personas p
     SET sheet_complete = public.persona_sheet_is_complete(p.id)
   WHERE p.world_id = p_world_id AND NOT p.is_template AND p.deleted_at IS NULL
     AND p.sheet_complete IS DISTINCT FROM public.persona_sheet_is_complete(p.id);
$$;
REVOKE ALL ON FUNCTION public.refresh_world_sheets_complete(uuid) FROM PUBLIC, anon, authenticated;

-- Un champ change : la fiche se recalcule ; un champ du modèle change
-- d'obligation : toutes les fiches du monde.
CREATE OR REPLACE FUNCTION public.tg_persona_field_sheet_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_persona  uuid;
  v_world    uuid;
  v_template boolean;
BEGIN
  SELECT p.id, p.world_id, p.is_template INTO v_persona, v_world, v_template
    FROM public.persona_sections s
    JOIN public.personas p ON p.id = s.persona_id
   WHERE s.id = coalesce(NEW.section_id, OLD.section_id);
  -- Section déjà partie : le persona ou la section se supprime en cascade.
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_template THEN
    IF (TG_OP = 'INSERT' AND NEW.required)
       OR (TG_OP = 'DELETE' AND OLD.required)
       OR (TG_OP = 'UPDATE' AND NEW.required IS DISTINCT FROM OLD.required) THEN
      PERFORM public.refresh_world_sheets_complete(v_world);
    END IF;
  ELSE
    PERFORM public.refresh_persona_sheet_complete(v_persona);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_persona_field_sheet_complete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_persona_field_sheet_complete ON public.persona_section_fields;
CREATE TRIGGER trg_persona_field_sheet_complete
  AFTER INSERT OR UPDATE OF data, type, required, template_field_id OR DELETE ON public.persona_section_fields
  FOR EACH ROW EXECUTE FUNCTION public.tg_persona_field_sheet_complete();

-- Une section supprimée emporte ses champs sans que leur déclencheur ne
-- retrouve le persona : on recalcule ici.
CREATE OR REPLACE FUNCTION public.tg_persona_section_sheet_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_template boolean; v_world uuid;
BEGIN
  SELECT p.is_template, p.world_id INTO v_template, v_world FROM public.personas p WHERE p.id = OLD.persona_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_template THEN
    PERFORM public.refresh_world_sheets_complete(v_world);
  ELSE
    PERFORM public.refresh_persona_sheet_complete(OLD.persona_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_persona_section_sheet_complete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_persona_section_sheet_complete ON public.persona_sections;
CREATE TRIGGER trg_persona_section_sheet_complete
  AFTER DELETE ON public.persona_sections
  FOR EACH ROW EXECUTE FUNCTION public.tg_persona_section_sheet_complete();

-- Ajoute à une fiche les champs verrouillés ou obligatoires du modèle qui
-- n'y ont pas encore de champ lié (section homonyme, créée au besoin).
-- Renvoie le nombre de champs ajoutés.
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
   WHERE p.id = p_persona_id AND p.user_id = v_uid AND NOT p.is_template AND p.deleted_at IS NULL;
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
      -- La structure du modèle, vidée : le titre garde son texte, les grilles
      -- d'images partent vides (les images du modèle restent à son auteur).
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
REVOKE ALL ON FUNCTION public.sync_persona_template_fields(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_persona_template_fields(uuid) TO authenticated;

-- ── 3. Validation ────────────────────────────────────────────

-- DEFAULT 'approved' le temps de créer la colonne : l'existant est validé.
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.personas DROP CONSTRAINT IF EXISTS personas_review_status_check;
ALTER TABLE public.personas
  ADD CONSTRAINT personas_review_status_check CHECK (review_status IN ('draft', 'submitted', 'approved'));
ALTER TABLE public.personas ALTER COLUMN review_status SET DEFAULT 'draft';
CREATE INDEX IF NOT EXISTS personas_world_review_idx
  ON public.personas (world_id, review_status) WHERE deleted_at IS NULL AND NOT is_template;

-- Le statut de départ d'un persona : validé hors monde, pour un modèle et
-- pour qui relit lui-même ; brouillon sinon.
CREATE OR REPLACE FUNCTION public.persona_initial_review_status(p_world_id uuid, p_user_id uuid, p_is_template boolean)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_world_id IS NULL OR p_is_template THEN 'approved'
    WHEN public.has_world_permission(p_world_id, p_user_id, 'personas.review') THEN 'approved'
    ELSE 'draft'
  END;
$$;
REVOKE ALL ON FUNCTION public.persona_initial_review_status(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_personas_review_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.review_status := public.persona_initial_review_status(NEW.world_id, NEW.user_id, NEW.is_template);
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  -- Pas encore de champ : complète si le modèle n'exige rien.
  NEW.sheet_complete := NEW.is_template OR NEW.world_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.personas t
      JOIN public.persona_sections ts ON ts.persona_id = t.id
      JOIN public.persona_section_fields tf ON tf.section_id = ts.id AND tf.required
     WHERE t.world_id = NEW.world_id AND t.is_template AND t.deleted_at IS NULL);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_personas_review_insert() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_personas_review_insert ON public.personas;
CREATE TRIGGER trg_personas_review_insert
  BEFORE INSERT ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.tg_personas_review_insert();

-- Écriture directe : les colonnes de validation sont réservées aux RPC (qui
-- s'exécutent sous leur propriétaire, pas sous `authenticated`). Un
-- changement de monde remet la validation à zéro.
CREATE OR REPLACE FUNCTION public.tg_personas_review_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
       NEW.review_status IS DISTINCT FROM OLD.review_status
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.sheet_complete IS DISTINCT FROM OLD.sheet_complete) THEN
    RAISE EXCEPTION 'La validation d''une fiche passe par submit_persona_for_review / review_persona.';
  END IF;

  IF NEW.world_id IS DISTINCT FROM OLD.world_id THEN
    NEW.review_status := public.persona_initial_review_status(NEW.world_id, NEW.user_id, NEW.is_template);
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    -- Les champs liés à l'ancien modèle ne comptent plus ; la fiche se
    -- recalcule quand le nouveau modèle est appliqué.
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
DROP TRIGGER IF EXISTS trg_personas_review_guard ON public.personas;
CREATE TRIGGER trg_personas_review_guard
  BEFORE UPDATE ON public.personas
  FOR EACH ROW EXECUTE FUNCTION public.tg_personas_review_guard();

-- Les commentaires de relecture.
CREATE TABLE IF NOT EXISTS public.persona_review_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id  uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  world_id    uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body        text NOT NULL DEFAULT '',
  -- La décision qui accompagne le commentaire, quand il vient d'une relecture.
  decision    text CHECK (decision IS NULL OR decision IN ('approved', 'draft')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.persona_review_comments ADD CONSTRAINT persona_review_comments_body_len CHECK (char_length(body) <= 2000);
CREATE INDEX IF NOT EXISTS persona_review_comments_persona_idx ON public.persona_review_comments (persona_id, created_at);
ALTER TABLE public.persona_review_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "persona_review_comments_select" ON public.persona_review_comments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.personas p WHERE p.id = persona_id AND p.user_id = (select auth.uid()))
  OR public.has_world_permission(world_id, (select auth.uid()), 'personas.review')
);
-- Un message dans le fil (sans décision) : le propriétaire ou un relecteur.
CREATE POLICY "persona_review_comments_insert" ON public.persona_review_comments FOR INSERT TO authenticated WITH CHECK (
  author_id = (select auth.uid())
  AND decision IS NULL
  AND EXISTS (SELECT 1 FROM public.personas p WHERE p.id = persona_id AND p.world_id = persona_review_comments.world_id)
  AND (
    EXISTS (SELECT 1 FROM public.personas p WHERE p.id = persona_id AND p.user_id = (select auth.uid()))
    OR public.has_world_permission(world_id, (select auth.uid()), 'personas.review')
  )
);
CREATE POLICY "persona_review_comments_delete" ON public.persona_review_comments FOR DELETE TO authenticated USING (
  author_id = (select auth.uid())
);

-- Les deux types de notification.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite',
    'chatroom_reply', 'persona_new_chatroom', 'persona_reply', 'relation_request',
    'role_mention', 'everyone_mention', 'persona_submitted', 'persona_reviewed'
  ));

ALTER TABLE public.notification_preferences DROP CONSTRAINT IF EXISTS notification_preferences_type_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'chatroom_reply',
    'persona_new_chatroom', 'persona_reply', 'relation_request',
    'role_mention', 'everyone_mention', 'persona_submitted', 'persona_reviewed'
  ));

-- Soumettre sa fiche : complète, dans un monde, pas déjà validée.
CREATE OR REPLACE FUNCTION public.submit_persona_for_review(p_persona_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_p     record;
  v_actor text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié.'; END IF;

  SELECT p.id, p.world_id, p.name, p.avatar_url, p.review_status INTO v_p
    FROM public.personas p
   WHERE p.id = p_persona_id AND p.user_id = v_uid AND NOT p.is_template AND p.deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Persona introuvable.'; END IF;
  IF v_p.world_id IS NULL THEN RAISE EXCEPTION 'Ce persona n''appartient à aucun monde.'; END IF;
  IF v_p.review_status = 'approved' THEN RAISE EXCEPTION 'Cette fiche est déjà validée.'; END IF;
  IF NOT public.persona_sheet_is_complete(p_persona_id) THEN
    RAISE EXCEPTION 'La fiche est incomplète.' USING ERRCODE = 'P0011';
  END IF;

  UPDATE public.personas SET review_status = 'submitted', sheet_complete = true WHERE id = p_persona_id;

  -- Une soumission répétée ne réveille pas les relecteurs.
  IF v_p.review_status = 'submitted' THEN RETURN; END IF;

  SELECT pr.username INTO v_actor FROM public.profiles pr WHERE pr.id = v_uid;
  INSERT INTO public.notifications (recipient_id, type, world_id, actor_id, actor_name, content, metadata)
  SELECT wm.user_id, 'persona_submitted', v_p.world_id, v_uid, v_actor, left(v_p.name, 200),
         jsonb_build_object('persona_id', v_p.id, 'persona_name', v_p.name, 'icon_url', v_p.avatar_url)
    FROM public.world_members wm
   WHERE wm.world_id = v_p.world_id
     AND wm.user_id <> v_uid
     AND public.has_world_permission(v_p.world_id, wm.user_id, 'personas.review')
   LIMIT 500;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_persona_for_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_persona_for_review(uuid) TO authenticated;

-- Relire : valider ('approved') ou renvoyer en brouillon ('draft'), avec un
-- commentaire facultatif ; le propriétaire est prévenu.
CREATE OR REPLACE FUNCTION public.review_persona(p_persona_id uuid, p_decision text, p_comment text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_p       record;
  v_actor   text;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié.'; END IF;
  IF p_decision NOT IN ('approved', 'draft') THEN RAISE EXCEPTION 'Décision inconnue.'; END IF;
  IF char_length(coalesce(v_comment, '')) > 2000 THEN RAISE EXCEPTION 'Commentaire trop long.'; END IF;

  SELECT p.id, p.world_id, p.user_id, p.name, p.avatar_url, p.review_status INTO v_p
    FROM public.personas p
   WHERE p.id = p_persona_id AND NOT p.is_template AND p.deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND OR v_p.world_id IS NULL THEN RAISE EXCEPTION 'Persona introuvable.'; END IF;
  IF NOT public.has_world_permission(v_p.world_id, v_uid, 'personas.review') THEN
    RAISE EXCEPTION 'Vous ne relisez pas les fiches de ce monde.';
  END IF;
  IF v_p.review_status = p_decision THEN RAISE EXCEPTION 'La fiche est déjà dans cet état.'; END IF;

  UPDATE public.personas
     SET review_status = p_decision, reviewed_by = v_uid, reviewed_at = now()
   WHERE id = p_persona_id;

  INSERT INTO public.persona_review_comments (persona_id, world_id, author_id, body, decision)
  VALUES (p_persona_id, v_p.world_id, v_uid, coalesce(v_comment, ''), p_decision);

  IF v_p.user_id <> v_uid THEN
    SELECT pr.username INTO v_actor FROM public.profiles pr WHERE pr.id = v_uid;
    INSERT INTO public.notifications (recipient_id, type, world_id, actor_id, actor_name, content, metadata)
    VALUES (v_p.user_id, 'persona_reviewed', v_p.world_id, v_uid, v_actor, left(v_p.name, 200),
            jsonb_build_object('persona_id', v_p.id, 'persona_name', v_p.name, 'icon_url', v_p.avatar_url,
                               'decision', p_decision, 'comment', left(v_comment, 200)));
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.review_persona(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_persona(uuid, text, text) TO authenticated;

-- Jouer exige une fiche validée et complète (en plus du quota de la 090).
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
    public.is_user_subscribed(p_uid)
    OR EXISTS (
      SELECT 1 FROM (
        SELECT id FROM public.personas
        WHERE user_id = p_uid
          AND world_id = (
            SELECT world_id FROM public.personas
            WHERE id = p_persona_id AND user_id = p_uid
          )
          AND NOT is_template
        ORDER BY created_at ASC, id ASC
        LIMIT 5
      ) eligible
      WHERE eligible.id = p_persona_id
    )
  );
$$;

-- ── 5. Lecture des fiches par les membres du monde ───────────

DROP POLICY IF EXISTS "sections_select_world_members" ON public.persona_sections;
CREATE POLICY "sections_select_world_members" ON public.persona_sections FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.personas p
           WHERE p.id = persona_sections.persona_id
             AND p.world_id IS NOT NULL AND p.deleted_at IS NULL
             AND public.is_world_member(p.world_id, (select auth.uid())))
);
DROP POLICY IF EXISTS "fields_select_world_members" ON public.persona_section_fields;
CREATE POLICY "fields_select_world_members" ON public.persona_section_fields FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.persona_sections s
            JOIN public.personas p ON p.id = s.persona_id
           WHERE s.id = persona_section_fields.section_id
             AND p.world_id IS NOT NULL AND p.deleted_at IS NULL
             AND public.is_world_member(p.world_id, (select auth.uid())))
);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT review_status, count(*) FROM public.personas GROUP BY 1;            -- → approved : tous
-- SELECT count(*) FROM public.persona_section_fields WHERE template_field_id IS NOT NULL;
-- SELECT public.persona_sheet_is_complete('<persona>');                       -- → true partout (aucun champ requis)
-- En tant que joueur : UPDATE public.personas SET review_status = 'approved' WHERE id = '<mien>'; -- → exception
-- SELECT public.submit_persona_for_review('<brouillon>'); → 'submitted', notifications aux relecteurs.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP POLICY "sections_select_world_members" ON public.persona_sections;
-- DROP POLICY "fields_select_world_members" ON public.persona_section_fields;
-- Rejouer is_persona_usable (090 + 131), les CHECK de types (178) après
-- suppression des notifications des deux types ;
-- DROP FUNCTION review_persona(uuid,text,text), submit_persona_for_review(uuid), sync_persona_template_fields(uuid),
--   persona_required_fields(uuid), persona_sheet_is_complete(uuid), persona_field_has_value(text,jsonb),
--   refresh_persona_sheet_complete(uuid), refresh_world_sheets_complete(uuid), persona_initial_review_status(uuid,uuid,boolean) ;
-- DROP TRIGGER … puis DROP FUNCTION tg_personas_review_insert(), tg_personas_review_guard(),
--   tg_persona_field_sheet_complete(), tg_persona_section_sheet_complete(), tg_persona_field_template_link() ;
-- DROP TABLE persona_review_comments ;
-- ALTER TABLE personas DROP COLUMN review_status, reviewed_by, reviewed_at, sheet_complete ;
-- ALTER TABLE persona_section_fields DROP COLUMN required, template_field_id ;
-- rejouer guard_locked_field_update (055) et world_permission_keys (176).
