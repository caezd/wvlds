-- 233 — Essai d'un bandeau : il s'affiche en tête de l'accueil de son auteur.
--
-- L'auteur d'une annonce n'en est jamais destinataire : il ne pouvait donc
-- pas voir son bandeau à sa place réelle, et l'essai d'un bandeau partait en
-- notification. Désormais :
-- - `send_world_announcement_test(…, 'banner', …)` dépose un bandeau d'essai
--   pour son seul auteur (variables remplacées, signature comprise), hors
--   historique, lectures et plafond du monde ; il remplace l'essai précédent
--   du même monde et disparaît au bout de 24 h ;
-- - `get_world_banners` le renvoie avec les vrais (`is_test`), en premier ;
-- - `dismiss_world_banner` le ferme comme un vrai.
-- Le plafond des essais (10 par heure et par personne) compte les deux formes.

-- ── 1. Les bandeaux d'essai ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_banner_tests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id        uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           text NOT NULL,
  body            text NOT NULL,
  signer          text,
  signed_as_world boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  dismissed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS world_banner_tests_user_world
  ON public.world_banner_tests (user_id, world_id, created_at DESC);
CREATE INDEX IF NOT EXISTS world_banner_tests_world
  ON public.world_banner_tests (world_id);

-- Lue et écrite par les seules fonctions ci-dessous (SECURITY DEFINER).
ALTER TABLE public.world_banner_tests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.world_banner_tests FROM anon, authenticated;

-- ── 2. L'essai ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_world_announcement_test(
  p_world_id uuid,
  p_kind     text,
  p_title    text,
  p_body     text,
  p_as_world boolean DEFAULT false
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

  -- L'essai d'un message privé reste possible quand les MP sont coupés.
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
    -- Un seul essai visible par monde : le nouveau ferme le précédent, qui
    -- reste compté dans le plafond. Au-delà d'un jour, plus rien n'affiche
    -- ni ne compte une ligne : on la purge.
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
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.send_world_announcement_test(uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_world_announcement_test(uuid, text, text, text, boolean) TO authenticated;

-- ── 3. Les bandeaux d'un membre, essai compris ───────────────
DROP FUNCTION IF EXISTS public.get_world_banners(uuid);
CREATE OR REPLACE FUNCTION public.get_world_banners(p_world_id uuid)
RETURNS TABLE (id uuid, title text, body text, created_at timestamptz, signer text, signed_as_world boolean, is_test boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT x.id, x.title, x.body, x.created_at, x.signer, x.signed_as_world, x.is_test
    FROM (
      -- L'essai d'abord : c'est celui qu'on vient de demander.
      (SELECT b.id, b.title, b.body, b.created_at, b.signer, b.signed_as_world, true AS is_test
         FROM public.world_banner_tests b
        WHERE b.user_id = (select auth.uid())
          AND b.world_id = p_world_id
          AND b.dismissed_at IS NULL
          AND b.created_at > now() - interval '1 day'
        ORDER BY b.created_at DESC
        LIMIT 1)
      UNION ALL
      (SELECT a.id,
              replace(replace(a.title, '{username}', coalesce(me.username, '')), '{world}', w.name),
              replace(replace(a.body, '{username}', coalesce(me.username, '')), '{world}', w.name),
              a.created_at,
              CASE WHEN a.signed_as_world THEN w.name ELSE au.username END,
              a.signed_as_world,
              false
         FROM public.world_announcement_recipients r
         JOIN public.world_announcements a ON a.id = r.announcement_id
         JOIN public.worlds w ON w.id = a.world_id AND w.deleted_at IS NULL
         LEFT JOIN public.profiles me ON me.id = r.user_id
         LEFT JOIN public.profiles au ON au.id = a.author_id
        WHERE r.user_id = (select auth.uid())
          AND a.world_id = p_world_id
          AND a.kind = 'banner'
          AND r.dismissed_at IS NULL
          AND a.retracted_at IS NULL
          AND (a.banner_until IS NULL OR a.banner_until > now())
          AND EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = p_world_id AND wm.user_id = r.user_id)
        ORDER BY a.created_at DESC
        LIMIT 3)
    ) x
   ORDER BY x.is_test DESC, x.created_at DESC
   LIMIT 3;
$$;
REVOKE ALL ON FUNCTION public.get_world_banners(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_world_banners(uuid) TO authenticated;

-- ── 4. Fermer un bandeau, vrai ou d'essai ────────────────────
CREATE OR REPLACE FUNCTION public.dismiss_world_banner(p_announcement_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.world_announcement_recipients
     SET dismissed_at = now()
   WHERE announcement_id = p_announcement_id
     AND user_id = (select auth.uid())
     AND dismissed_at IS NULL;
  UPDATE public.world_banner_tests
     SET dismissed_at = now()
   WHERE id = p_announcement_id
     AND user_id = (select auth.uid())
     AND dismissed_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.dismiss_world_banner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_world_banner(uuid) TO authenticated;

-- Vérification :
-- SELECT pg_get_function_result('public.get_world_banners'::regproc);
--   → TABLE(id uuid, …, signed_as_world boolean, is_test boolean)
