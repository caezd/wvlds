-- 223 — Enregistrer une fiche de persona en une seule requête, tout ou rien.
--
-- « Enregistrer » envoyait une requête par onglet ou champ ajouté, modifié ou
-- supprimé, l'une après l'autre (lib/personaSectionsDiff) : une fiche remaniée
-- coûtait autant d'allers-retours, et un échec au milieu laissait une fiche à
-- moitié écrite. Et une écriture refusée par la RLS ne lève pas d'erreur — elle
-- ne touche simplement aucune ligne : la fiche semblait enregistrée, puis
-- revenait en arrière au rechargement.
--
-- `save_persona_sheet` fait tout en une transaction :
--   - le patch de la fiche (liste blanche de colonnes, celles du brouillon) ;
--   - les écritures d'onglets et de champs, dans l'ordre qui tient : effacer,
--     créer les onglets (leurs identifiants provisoires « tmp-… » sont résolus
--     ici, y compris pour un champ DÉPLACÉ vers un onglet tout neuf), modifier,
--     créer et modifier les champs.
-- Chaque écriture vérifie qu'elle a bien porté ; sinon tout est annulé.
--
-- SECURITY INVOKER : les policies et les triggers (champs verrouillés, fiche
-- complète, revue) s'appliquent exactement comme aux écritures directes
-- qu'elle remplace.

CREATE OR REPLACE FUNCTION public.save_persona_sheet(
  p_persona_id uuid,
  p_patch      jsonb DEFAULT '{}'::jsonb,
  p_ops        jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  n          int;
  e          jsonb;
  ids        uuid[];
  reels      jsonb := '{}'::jsonb;  -- identifiant provisoire → identifiant réel
  nouvel_id  uuid;
  section    uuid;
BEGIN
  p_patch := COALESCE(p_patch, '{}'::jsonb);
  p_ops := COALESCE(p_ops, '{}'::jsonb);

  -- ── La fiche ───────────────────────────────────────────────────
  IF p_patch <> '{}'::jsonb THEN
    UPDATE public.personas p SET
      name             = CASE WHEN p_patch ? 'name'             THEN p_patch->>'name'                  ELSE p.name END,
      faceclaim        = CASE WHEN p_patch ? 'faceclaim'        THEN p_patch->>'faceclaim'             ELSE p.faceclaim END,
      avatar_url       = CASE WHEN p_patch ? 'avatar_url'       THEN p_patch->>'avatar_url'            ELSE p.avatar_url END,
      avatar_config    = CASE WHEN p_patch ? 'avatar_config'
                              THEN NULLIF(p_patch->'avatar_config', 'null'::jsonb)                     ELSE p.avatar_config END,
      banner_url       = CASE WHEN p_patch ? 'banner_url'       THEN p_patch->>'banner_url'            ELSE p.banner_url END,
      avatar_frame_id  = CASE WHEN p_patch ? 'avatar_frame_id'  THEN (p_patch->>'avatar_frame_id')::uuid ELSE p.avatar_frame_id END,
      narrative_status = CASE WHEN p_patch ? 'narrative_status' THEN p_patch->>'narrative_status'      ELSE p.narrative_status END
    WHERE p.id = p_persona_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'Fiche introuvable ou non modifiable' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── Effacements (idempotents : déjà effacé, rien à faire) ─────
  SELECT COALESCE(array_agg(v::uuid), '{}') INTO ids
  FROM jsonb_array_elements_text(COALESCE(p_ops->'deleteFields', '[]')) v;
  IF cardinality(ids) > 0 THEN
    DELETE FROM public.persona_section_fields f
    USING public.persona_sections s
    WHERE f.id = ANY(ids) AND s.id = f.section_id AND s.persona_id = p_persona_id;
    -- Encore visible après coup : la RLS a refusé l'effacement.
    IF EXISTS (SELECT 1 FROM public.persona_section_fields WHERE id = ANY(ids)) THEN
      RAISE EXCEPTION 'Suppression de champ refusée' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(v::uuid), '{}') INTO ids
  FROM jsonb_array_elements_text(COALESCE(p_ops->'deleteSections', '[]')) v;
  IF cardinality(ids) > 0 THEN
    DELETE FROM public.persona_sections WHERE id = ANY(ids) AND persona_id = p_persona_id;
    IF EXISTS (SELECT 1 FROM public.persona_sections WHERE id = ANY(ids)) THEN
      RAISE EXCEPTION 'Suppression d''onglet refusée' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── Onglets ────────────────────────────────────────────────────
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_ops->'insertSections', '[]')) LOOP
    INSERT INTO public.persona_sections (persona_id, name, position)
    VALUES (p_persona_id, COALESCE(e->>'name', ''), COALESCE((e->>'position')::int, 0))
    RETURNING id INTO nouvel_id;
    reels := reels || jsonb_build_object(e->>'tempId', nouvel_id);
  END LOOP;

  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_ops->'updateSections', '[]')) LOOP
    UPDATE public.persona_sections s SET
      name     = CASE WHEN e->'patch' ? 'name'     THEN e->'patch'->>'name'            ELSE s.name END,
      position = CASE WHEN e->'patch' ? 'position' THEN (e->'patch'->>'position')::int ELSE s.position END
    WHERE s.id = (e->>'id')::uuid AND s.persona_id = p_persona_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'Onglet introuvable ou non modifiable' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- ── Champs ─────────────────────────────────────────────────────
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_ops->'insertFields', '[]')) LOOP
    section := COALESCE(reels->>(e->>'sectionId'), e->>'sectionId')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.persona_sections WHERE id = section AND persona_id = p_persona_id) THEN
      RAISE EXCEPTION 'Onglet du champ introuvable' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.persona_section_fields (section_id, type, data, position, locked, required, template_field_id)
    VALUES (
      section,
      COALESCE(e->'row'->>'type', 'text'),
      COALESCE(NULLIF(e->'row'->'data', 'null'::jsonb), '{}'::jsonb),
      COALESCE((e->'row'->>'position')::int, 0),
      COALESCE((e->'row'->>'locked')::boolean, false),
      COALESCE((e->'row'->>'required')::boolean, false),
      (e->'row'->>'template_field_id')::uuid
    );
  END LOOP;

  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_ops->'updateFields', '[]')) LOOP
    -- Déplacé vers un onglet créé dans la même séance : son vrai identifiant.
    section := CASE WHEN e->'patch' ? 'section_id'
                    THEN COALESCE(reels->>(e->'patch'->>'section_id'), e->'patch'->>'section_id')::uuid END;
    IF section IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.persona_sections WHERE id = section AND persona_id = p_persona_id) THEN
      RAISE EXCEPTION 'Onglet du champ introuvable' USING ERRCODE = 'P0002';
    END IF;
    UPDATE public.persona_section_fields f SET
      section_id        = COALESCE(section, f.section_id),
      type              = CASE WHEN e->'patch' ? 'type'     THEN e->'patch'->>'type'                ELSE f.type END,
      data              = CASE WHEN e->'patch' ? 'data'
                               THEN COALESCE(NULLIF(e->'patch'->'data', 'null'::jsonb), '{}'::jsonb) ELSE f.data END,
      position          = CASE WHEN e->'patch' ? 'position' THEN (e->'patch'->>'position')::int     ELSE f.position END,
      locked            = CASE WHEN e->'patch' ? 'locked'   THEN (e->'patch'->>'locked')::boolean   ELSE f.locked END,
      required          = CASE WHEN e->'patch' ? 'required' THEN (e->'patch'->>'required')::boolean ELSE f.required END,
      template_field_id = CASE WHEN e->'patch' ? 'template_field_id'
                               THEN (e->'patch'->>'template_field_id')::uuid                        ELSE f.template_field_id END
    FROM public.persona_sections s
    WHERE f.id = (e->>'id')::uuid AND s.id = f.section_id AND s.persona_id = p_persona_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'Champ introuvable ou non modifiable' USING ERRCODE = '42501';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.save_persona_sheet(uuid, jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_persona_sheet(uuid, jsonb, jsonb) TO authenticated;
