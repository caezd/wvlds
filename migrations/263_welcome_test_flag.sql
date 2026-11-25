-- ============================================================
-- Migration 263 — Essai du message de bienvenue, notifié comme tel
-- ============================================================
-- Le message de bienvenue envoyé à un nouveau membre porte déjà
-- `metadata.welcome = true` (send_world_welcome, migration 229) : le client
-- le libelle « vous souhaite la bienvenue » au lieu de « a publié une
-- annonce ». L'essai lancé depuis l'éditeur du bienvenue passait par
-- `send_world_announcement_test` sans cette marque, et se lisait donc comme
-- une annonce. Nouveau paramètre `p_welcome` (faux par défaut) qui ajoute la
-- marque ; rien d'autre ne change.

DROP FUNCTION IF EXISTS public.send_world_announcement_test(uuid, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.send_world_announcement_test(
  p_world_id uuid,
  p_kind     text,
  p_title    text,
  p_body     text,
  p_as_world boolean DEFAULT false,
  p_welcome  boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := (select auth.uid());
  v_world_name text;
  v_actor      text;
  v_title      text;
  v_body       text := btrim(coalesce(p_body, ''));
  v_as_world   boolean := coalesce(p_as_world, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.' USING ERRCODE = '42501';
  END IF;

  SELECT w.name INTO v_world_name
    FROM public.worlds w WHERE w.id = p_world_id AND w.deleted_at IS NULL;
  IF NOT FOUND OR NOT public.has_world_permission(p_world_id, v_uid, 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'message' THEN
    IF v_as_world OR char_length(v_body) NOT BETWEEN 1 AND 4000 THEN
      RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
    END IF;
    v_title := NULL;
  ELSE
    v_title := public.world_announcement_validate(p_kind, p_title, p_body, v_as_world, NULL);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('world_announcement_test:' || v_uid::text, 0));
  IF (SELECT count(*) FROM public.notifications n
       WHERE n.recipient_id = v_uid
         AND n.created_at > now() - interval '1 hour'
         AND n.type = 'world_announcement'
         AND (n.metadata ->> 'test') = 'true')
   + (SELECT count(*) FROM public.world_banner_tests b
       WHERE b.user_id = v_uid AND b.created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'announcement_test_rate_limit' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.username INTO v_actor FROM public.profiles p WHERE p.id = v_uid;

  IF p_kind = 'banner' THEN
    DELETE FROM public.world_banner_tests b
     WHERE b.user_id = v_uid AND b.created_at < now() - interval '1 day';
    UPDATE public.world_banner_tests b
       SET dismissed_at = now()
     WHERE b.user_id = v_uid AND b.world_id = p_world_id AND b.dismissed_at IS NULL;
    INSERT INTO public.world_banner_tests (world_id, user_id, title, body, signer, signed_as_world)
    VALUES (
      p_world_id, v_uid,
      left(replace(replace(v_title, '{username}', coalesce(v_actor, '')), '{world}', v_world_name), 200),
      left(replace(replace(v_body, '{username}', coalesce(v_actor, '')), '{world}', v_world_name), 4000),
      CASE WHEN v_as_world THEN v_world_name ELSE v_actor END,
      v_as_world
    );
    PERFORM public.wvlds_notify('msgs:' || v_uid::text, 'world_banner', jsonb_build_object('world_id', p_world_id));
    RETURN;
  END IF;

  INSERT INTO public.notifications (recipient_id, type, world_id, actor_id, actor_name, content, metadata)
  VALUES (
    v_uid, 'world_announcement', p_world_id,
    CASE WHEN v_as_world THEN NULL ELSE v_uid END,
    CASE WHEN v_as_world THEN v_world_name ELSE v_actor END,
    left(replace(replace(v_title, '{username}', coalesce(v_actor, '')), '{world}', v_world_name), 200),
    jsonb_build_object(
      'test', true,
      'kind', p_kind,
      'world_name', v_world_name,
      'signed_as_world', v_as_world,
      'body', left(replace(replace(v_body, '{username}', coalesce(v_actor, '')), '{world}', v_world_name), 4000)
    ) || CASE WHEN coalesce(p_welcome, false) THEN jsonb_build_object('welcome', true) ELSE '{}'::jsonb END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_world_announcement_test(uuid, text, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_world_announcement_test(uuid, text, text, text, boolean, boolean) TO authenticated;

-- Vérification :
-- SELECT has_function_privilege('anon', 'public.send_world_announcement_test(uuid,text,text,text,boolean,boolean)', 'EXECUTE');          -- → false
-- SELECT has_function_privilege('authenticated', 'public.send_world_announcement_test(uuid,text,text,text,boolean,boolean)', 'EXECUTE'); -- → true
