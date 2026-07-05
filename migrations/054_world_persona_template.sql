-- ============================================================
-- Migration 054 — Fiche de persona par défaut d'un monde
-- La « fiche par défaut » est un persona modèle : une ligne de
-- public.personas avec is_template = true, possédée par le
-- propriétaire du monde (un seul modèle par monde). À la création
-- d'un persona dans le monde, ses sections/champs sont copiés
-- depuis le modèle (côté application, createPersona).
--
-- NB : les policies passent par les fonctions SECURITY DEFINER
-- (is_world_owner_direct, is_world_member) et jamais par des
-- sous-requêtes directes sur worlds/world_members — les policies
-- de worlds relisent personas (030), une référence directe crée
-- une récursion infinie RLS (cf. 031).
-- À exécuter dans le SQL Editor du dashboard Supabase.
-- ============================================================

-- ── 1. Colonne is_template + unicité par monde ───────────────
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS personas_world_template_unique
  ON public.personas (world_id) WHERE is_template;

-- ── 2. Quota : les fiches modèles ne comptent pas ─────────────
CREATE OR REPLACE FUNCTION public.has_persona_capacity(u uuid, w uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE c INT;
BEGIN
  IF public.is_user_subscribed(u) THEN RETURN TRUE; END IF;
  IF w IS NOT NULL THEN
    SELECT COUNT(*) INTO c FROM public.personas
      WHERE user_id = u AND world_id = w AND NOT is_template;
  ELSE
    SELECT COUNT(*) INTO c FROM public.personas
      WHERE user_id = u AND world_id IS NULL AND NOT is_template;
  END IF;
  RETURN c < 5;
END;
$$;

-- ── 3. Trigger : la limite ne s'applique pas aux modèles ─────
CREATE OR REPLACE FUNCTION public.enforce_persona_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_template THEN RETURN NEW; END IF;
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

-- ── 4. RLS INSERT : seul le owner du monde crée le modèle ────
DROP POLICY IF EXISTS personas_insert_with_capacity ON public.personas;

CREATE POLICY personas_insert_with_capacity ON public.personas
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (NOT is_template AND public.has_persona_capacity(auth.uid(), world_id))
      OR (
        is_template
        AND world_id IS NOT NULL
        AND public.is_world_owner_direct(world_id, auth.uid())
      )
    )
  );

-- ── 5. RLS SELECT sections/champs du modèle pour les membres ─
-- La lecture du persona modèle lui-même est déjà couverte par
-- personas_readable_by_world_members (031). Les sections/champs,
-- eux, ne sont lisibles que par le propriétaire — on ouvre la
-- lecture aux membres du monde pour permettre la copie de la
-- fiche à la création d'un persona.
DROP POLICY IF EXISTS sections_select_world_template ON public.persona_sections;
CREATE POLICY sections_select_world_template ON public.persona_sections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.personas p
      WHERE p.id = persona_sections.persona_id
        AND p.is_template
        AND public.is_world_member(p.world_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS fields_select_world_template ON public.persona_section_fields;
CREATE POLICY fields_select_world_template ON public.persona_section_fields
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.persona_sections ps
      JOIN public.personas p ON p.id = ps.persona_id
      WHERE ps.id = persona_section_fields.section_id
        AND p.is_template
        AND public.is_world_member(p.world_id, auth.uid())
    )
  );
