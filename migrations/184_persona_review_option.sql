-- ============================================================
-- Migration 184 — La validation des fiches devient une option du monde
-- ============================================================
-- La 181 validait les fiches de tous les mondes, sans réglage. Or la
-- relecture n'a de sens qu'avec une fiche par défaut — c'est elle qui dit ce
-- qu'une fiche doit contenir — et tous les mondes ne veulent pas d'un
-- passage devant les administrateurs. Elle devient donc une option
-- complémentaire de la fiche par défaut : `worlds.persona_review_enabled`,
-- active seulement si le monde a aussi un modèle.
--
-- `world_persona_review_active(wid)` porte la règle. Inactive : un persona
-- naît validé, joue sans relecture (une fiche incomplète reste bloquée : les
-- champs obligatoires sont l'affaire du modèle, pas de la relecture), et les
-- RPC de soumission et de relecture refusent. Les statuts déjà posés ne
-- bougent pas : une option coupée puis rouverte retrouve ses brouillons.

ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS persona_review_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.world_persona_review_active(p_world_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.persona_review_enabled)
     AND EXISTS (SELECT 1 FROM public.personas t WHERE t.world_id = p_world_id AND t.is_template AND t.deleted_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.world_persona_review_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.world_persona_review_active(uuid) TO authenticated;

-- Le statut de départ (181/182) : validé quand rien ne relit.
CREATE OR REPLACE FUNCTION public.persona_initial_review_status(p_world_id uuid, p_user_id uuid, p_is_template boolean, p_is_npc boolean DEFAULT false)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_world_id IS NULL OR p_is_template OR p_is_npc THEN 'approved'
    WHEN NOT public.world_persona_review_active(p_world_id) THEN 'approved'
    WHEN public.has_world_permission(p_world_id, p_user_id, 'personas.review') THEN 'approved'
    ELSE 'draft'
  END;
$$;
REVOKE ALL ON FUNCTION public.persona_initial_review_status(uuid, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;

-- Jouable (090/181/182) : complète, validée si le monde relit, puis le quota.
CREATE OR REPLACE FUNCTION public.is_persona_usable(p_persona_id UUID, p_uid UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personas p
     WHERE p.id = p_persona_id
       AND p.sheet_complete
       AND (p.review_status = 'approved' OR NOT public.world_persona_review_active(p.world_id))
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

-- Soumettre et relire exigent que le monde relise.
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
  IF NOT public.world_persona_review_active(v_p.world_id) THEN
    RAISE EXCEPTION 'La validation des fiches n''est pas activée dans ce monde.';
  END IF;
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
  IF NOT public.world_persona_review_active(v_p.world_id) THEN
    RAISE EXCEPTION 'La validation des fiches n''est pas activée dans ce monde.';
  END IF;
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

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT persona_review_enabled, count(*) FROM public.worlds GROUP BY 1;      -- → false : tous
-- SELECT public.world_persona_review_active('<monde avec modèle>');           -- → false tant que l'option est coupée
-- En tant que joueur d'un monde sans option : INSERT persona → review_status = 'approved'.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Rejouer persona_initial_review_status, is_persona_usable, submit_persona_for_review et
-- review_persona de la 182/181 ; DROP FUNCTION world_persona_review_active(uuid) ;
-- ALTER TABLE worlds DROP COLUMN persona_review_enabled.
