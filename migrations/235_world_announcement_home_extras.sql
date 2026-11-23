-- ─────────────────────────────────────────────────────────────
-- Migration 235 — Annonces : accueil, épingle, étiquette, image, modification
--
-- 1. Options d'une annonce (`p_extras`, à l'envoi comme après) :
--      show_on_home  afficher dans le widget « Dernières annonces » de
--                    l'accueil du monde — pour TOUS les membres, quel que
--                    soit le ciblage de l'envoi (c'est un choix explicite) ;
--      pinned        garder en tête du widget ;
--      label         étiquette : info, event, rules, maintenance, important ;
--      image_url     image d'en-tête, dans le stockage public du projet.
--    L'étiquette et l'image suivent dans les notifications déjà déposées.
-- 2. Modifier une annonce envoyée (`update_world_announcement`) : titre,
--    texte et options. Notifications, messages privés et bandeaux suivent ;
--    `edited_at` le signale.
-- 3. Lecture pour le widget (`get_world_home_announcements`) : membres du
--    monde seulement, épinglées d'abord.
-- 4. Avis `announcement` sur le canal du monde dès qu'une annonce affichée
--    sur l'accueil change : le widget se met à jour en direct.
--
-- L'envoi lui-même (`world_announcement_dispatch`) ne change pas : les
-- options s'appliquent juste après, dans la même transaction.
-- ─────────────────────────────────────────────────────────────

-- ── 0. Colonnes ──────────────────────────────────────────────
ALTER TABLE public.world_announcements
  ADD COLUMN IF NOT EXISTS show_on_home boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at    timestamptz,
  ADD COLUMN IF NOT EXISTS label        text,
  ADD COLUMN IF NOT EXISTS image_url    text,
  ADD COLUMN IF NOT EXISTS edited_at    timestamptz;

ALTER TABLE public.world_announcements DROP CONSTRAINT IF EXISTS world_announcements_label_check;
ALTER TABLE public.world_announcements
  ADD CONSTRAINT world_announcements_label_check
  CHECK (label IS NULL OR label IN ('info', 'event', 'rules', 'maintenance', 'important'));
ALTER TABLE public.world_announcements DROP CONSTRAINT IF EXISTS world_announcements_image_check;
ALTER TABLE public.world_announcements
  ADD CONSTRAINT world_announcements_image_check
  CHECK (image_url IS NULL OR image_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/[a-z0-9_-]+/');

CREATE INDEX IF NOT EXISTS world_announcements_home
  ON public.world_announcements (world_id, pinned_at DESC NULLS LAST, created_at DESC)
  WHERE show_on_home AND retracted_at IS NULL;

ALTER TABLE public.world_scheduled_announcements
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 1. Les options : validation et application ───────────────
-- Rend les options normalisées (seules les clés connues), ou lève
-- `announcement_invalid`.
CREATE OR REPLACE FUNCTION public.world_announcement_normalize_extras(p_extras jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_label text;
  v_image text;
BEGIN
  IF p_extras IS NULL OR jsonb_typeof(p_extras) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  IF p_extras ? 'show_on_home' THEN
    IF jsonb_typeof(p_extras -> 'show_on_home') <> 'boolean' THEN
      RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('show_on_home', p_extras -> 'show_on_home');
  END IF;
  IF p_extras ? 'pinned' THEN
    IF jsonb_typeof(p_extras -> 'pinned') <> 'boolean' THEN
      RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('pinned', p_extras -> 'pinned');
  END IF;
  IF p_extras ? 'label' THEN
    v_label := nullif(p_extras ->> 'label', '');
    IF v_label IS NOT NULL AND v_label NOT IN ('info', 'event', 'rules', 'maintenance', 'important') THEN
      RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('label', v_label);
  END IF;
  IF p_extras ? 'image_url' THEN
    v_image := nullif(p_extras ->> 'image_url', '');
    IF v_image IS NOT NULL
       AND (char_length(v_image) > 1000
            OR v_image !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/[a-z0-9_-]+/') THEN
      RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
    END IF;
    v_out := v_out || jsonb_build_object('image_url', v_image);
  END IF;
  RETURN v_out;
END;
$$;

-- Interne : applique des options DÉJÀ normalisées à une annonce.
CREATE OR REPLACE FUNCTION public.world_announcement_apply_extras(p_id uuid, p_extras jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_extras IS NULL OR p_extras = '{}'::jsonb THEN
    RETURN;
  END IF;

  UPDATE public.world_announcements a SET
    show_on_home = CASE WHEN p_extras ? 'show_on_home' THEN (p_extras ->> 'show_on_home')::boolean ELSE a.show_on_home END,
    label        = CASE WHEN p_extras ? 'label' THEN p_extras ->> 'label' ELSE a.label END,
    image_url    = CASE WHEN p_extras ? 'image_url' THEN p_extras ->> 'image_url' ELSE a.image_url END
  WHERE a.id = p_id;

  -- L'épingle n'a de sens que sur l'accueil : retirée de l'accueil, l'annonce
  -- perd aussi son épingle.
  UPDATE public.world_announcements a SET
    pinned_at = CASE
      WHEN NOT a.show_on_home THEN NULL
      WHEN p_extras ? 'pinned' AND (p_extras ->> 'pinned')::boolean THEN coalesce(a.pinned_at, now())
      WHEN p_extras ? 'pinned' THEN NULL
      ELSE a.pinned_at
    END
  WHERE a.id = p_id;

  -- L'étiquette et l'image suivent dans les notifications déjà déposées.
  IF p_extras ? 'label' OR p_extras ? 'image_url' THEN
    UPDATE public.notifications n
       SET metadata = coalesce(n.metadata, '{}'::jsonb)
                      || jsonb_build_object('label', a.label, 'image_url', a.image_url)
      FROM public.world_announcement_recipients r
      JOIN public.world_announcements a ON a.id = r.announcement_id
     WHERE r.announcement_id = p_id AND n.id = r.notification_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.world_announcement_apply_extras(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ── 2. L'envoi, avec ses options ─────────────────────────────
DROP FUNCTION IF EXISTS public.send_world_announcement(uuid, text, text, text, uuid[], jsonb, boolean, integer);
CREATE OR REPLACE FUNCTION public.send_world_announcement(
  p_world_id    uuid,
  p_kind        text,
  p_title       text,
  p_body        text,
  p_role_ids    uuid[] DEFAULT '{}'::uuid[],
  p_filters     jsonb DEFAULT '{}'::jsonb,
  p_as_world    boolean DEFAULT false,
  p_banner_days integer DEFAULT NULL,
  p_extras      jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Validées AVANT l'envoi : une option refusée n'envoie rien.
  v_extras jsonb := public.world_announcement_normalize_extras(p_extras);
  v_res    jsonb;
BEGIN
  v_res := public.world_announcement_dispatch(
    (select auth.uid()), p_world_id, p_kind, p_title, p_body, p_role_ids, p_filters, p_as_world, p_banner_days);
  IF (v_res ->> 'id') IS NOT NULL THEN
    PERFORM public.world_announcement_apply_extras((v_res ->> 'id')::uuid, v_extras);
  END IF;
  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.send_world_announcement(uuid, text, text, text, uuid[], jsonb, boolean, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_world_announcement(uuid, text, text, text, uuid[], jsonb, boolean, integer, jsonb) TO authenticated;

-- ── 3. L'envoi programmé, avec ses options ───────────────────
DROP FUNCTION IF EXISTS public.schedule_world_announcement(uuid, text, text, text, uuid[], jsonb, boolean, integer, timestamptz);
CREATE OR REPLACE FUNCTION public.schedule_world_announcement(
  p_world_id      uuid,
  p_kind          text,
  p_title         text,
  p_body          text,
  p_role_ids      uuid[],
  p_filters       jsonb,
  p_as_world      boolean,
  p_banner_days   integer,
  p_scheduled_for timestamptz,
  p_extras        jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := (select auth.uid());
  v_title   text;
  v_roles   uuid[];
  v_filters jsonb;
  v_extras  jsonb;
  v_id      uuid;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.deleted_at IS NULL)
     OR NOT public.has_world_permission(p_world_id, v_uid, 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;

  v_title := public.world_announcement_validate(p_kind, p_title, p_body, p_as_world, p_banner_days);
  v_filters := public.world_announcement_normalize_filters(p_world_id, p_filters);
  v_extras := public.world_announcement_normalize_extras(p_extras);
  IF p_scheduled_for IS NULL OR p_scheduled_for <= now() OR p_scheduled_for > now() + interval '90 days' THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(r.id), '{}'::uuid[]) INTO v_roles
    FROM public.world_roles r
   WHERE r.world_id = p_world_id AND r.id = ANY (coalesce(p_role_ids, '{}'::uuid[]));
  IF cardinality(coalesce(p_role_ids, '{}'::uuid[])) > 0 AND cardinality(v_roles) = 0 THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('world_announcement_schedule:' || p_world_id::text, 0));
  IF (SELECT count(*) FROM public.world_scheduled_announcements s
       WHERE s.world_id = p_world_id AND s.status = 'pending') >= 20 THEN
    RAISE EXCEPTION 'announcement_schedule_limit' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.world_scheduled_announcements
    (world_id, author_id, kind, title, body, role_ids, filters, signed_as_world, banner_days, scheduled_for, extras)
  VALUES
    (p_world_id, v_uid, p_kind, v_title, btrim(p_body), v_roles, v_filters, coalesce(p_as_world, false),
     p_banner_days, p_scheduled_for, v_extras)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.schedule_world_announcement(uuid, text, text, text, uuid[], jsonb, boolean, integer, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_world_announcement(uuid, text, text, text, uuid[], jsonb, boolean, integer, timestamptz, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_scheduled_world_announcements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row  public.world_scheduled_announcements%ROWTYPE;
  v_res  jsonb;
  v_done integer := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.world_scheduled_announcements
     WHERE status = 'pending' AND scheduled_for <= now()
     ORDER BY scheduled_for
     LIMIT 50
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_res := public.world_announcement_dispatch(
        v_row.author_id, v_row.world_id, v_row.kind, v_row.title, v_row.body,
        v_row.role_ids, v_row.filters, v_row.signed_as_world, v_row.banner_days);
      IF (v_res ->> 'id') IS NULL THEN
        UPDATE public.world_scheduled_announcements
           SET status = 'failed', error = 'announcement_no_recipients', processed_at = now()
         WHERE id = v_row.id;
      ELSE
        -- Les options, validées à la programmation (migration 235).
        PERFORM public.world_announcement_apply_extras((v_res ->> 'id')::uuid, v_row.extras);
        UPDATE public.world_scheduled_announcements
           SET status = 'sent', announcement_id = (v_res ->> 'id')::uuid, processed_at = now()
         WHERE id = v_row.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.world_scheduled_announcements
         SET status = 'failed', error = left(SQLERRM, 200), processed_at = now()
       WHERE id = v_row.id;
    END;
    v_done := v_done + 1;
  END LOOP;
  RETURN v_done;
END;
$$;
REVOKE ALL ON FUNCTION public.process_scheduled_world_announcements() FROM PUBLIC, anon, authenticated;

-- ── 4. Modifier une annonce envoyée ──────────────────────────
-- `p_title` / `p_body` nuls : le contenu ne change pas. `p_extras` nul : les
-- options non plus. Le contenu d'une annonce retirée ne se modifie plus.
CREATE OR REPLACE FUNCTION public.update_world_announcement(
  p_id     uuid,
  p_title  text DEFAULT NULL,
  p_body   text DEFAULT NULL,
  p_extras jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := (select auth.uid());
  v_row    public.world_announcements%ROWTYPE;
  v_world  text;
  v_title  text;
  v_body   text;
  v_extras jsonb := public.world_announcement_normalize_extras(p_extras);
BEGIN
  SELECT * INTO v_row FROM public.world_announcements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_uid IS NULL
     OR NOT public.has_world_permission(v_row.world_id, v_uid, 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;

  IF p_title IS NOT NULL OR p_body IS NOT NULL THEN
    IF v_row.retracted_at IS NOT NULL THEN
      RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
    END IF;
    v_title := public.world_announcement_validate(
      v_row.kind, coalesce(p_title, v_row.title), coalesce(p_body, v_row.body), v_row.signed_as_world, NULL);
    v_body := btrim(coalesce(p_body, v_row.body));
    SELECT w.name INTO v_world FROM public.worlds w WHERE w.id = v_row.world_id;

    UPDATE public.world_announcements
       SET title = v_title, body = v_body, edited_at = now()
     WHERE id = p_id;

    IF v_row.kind = 'notification' THEN
      UPDATE public.notifications n
         SET content = left(replace(replace(v_title, '{username}', coalesce(p.username, '')), '{world}', v_world), 200),
             metadata = coalesce(n.metadata, '{}'::jsonb) || jsonb_build_object(
               'body', left(replace(replace(v_body, '{username}', coalesce(p.username, '')), '{world}', v_world), 4000),
               'edited', true)
        FROM public.world_announcement_recipients r
        LEFT JOIN public.profiles p ON p.id = r.user_id
       WHERE r.announcement_id = p_id AND n.id = r.notification_id;
    ELSIF v_row.kind = 'message' THEN
      UPDATE public.dm_messages m
         SET content = left(replace(replace(v_body, '{username}', coalesce(p.username, '')), '{world}', v_world), 4000)
        FROM public.world_announcement_recipients r
        LEFT JOIN public.profiles p ON p.id = r.user_id
       WHERE r.announcement_id = p_id AND m.id = r.dm_message_id;
    ELSE
      -- Bandeau : rendu à la lecture ; on prévient ceux qui l'ont encore.
      PERFORM public.wvlds_notify('msgs:' || r.user_id::text, 'world_banner',
                                  jsonb_build_object('world_id', v_row.world_id))
         FROM public.world_announcement_recipients r
        WHERE r.announcement_id = p_id AND r.dismissed_at IS NULL;
    END IF;
  END IF;

  PERFORM public.world_announcement_apply_extras(p_id, v_extras);
END;
$$;
REVOKE ALL ON FUNCTION public.update_world_announcement(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_world_announcement(uuid, text, text, jsonb) TO authenticated;

-- ── 5. Le widget de l'accueil ────────────────────────────────
-- Membres du monde seulement. Les variables se remplacent pour le lecteur.
CREATE OR REPLACE FUNCTION public.get_world_home_announcements(p_world_id uuid, p_limit integer DEFAULT 5)
RETURNS TABLE (
  id uuid, kind text, title text, body text, label text, image_url text,
  pinned boolean, created_at timestamptz, edited_at timestamptz,
  signed_as_world boolean, signer text, signer_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.kind,
         replace(replace(a.title, '{username}', coalesce(me.username, '')), '{world}', w.name),
         replace(replace(a.body, '{username}', coalesce(me.username, '')), '{world}', w.name),
         a.label, a.image_url, a.pinned_at IS NOT NULL, a.created_at, a.edited_at,
         a.signed_as_world,
         CASE WHEN a.signed_as_world THEN w.name ELSE au.username END,
         CASE WHEN a.signed_as_world THEN w.icon_url ELSE au.avatar_url END
    FROM public.world_announcements a
    JOIN public.worlds w ON w.id = a.world_id AND w.deleted_at IS NULL
    LEFT JOIN public.profiles au ON au.id = a.author_id
    LEFT JOIN public.profiles me ON me.id = (select auth.uid())
   WHERE a.world_id = p_world_id
     AND a.show_on_home
     AND a.retracted_at IS NULL
     AND public.is_world_member(p_world_id, (select auth.uid()))
   ORDER BY a.pinned_at DESC NULLS LAST, a.created_at DESC
   LIMIT least(greatest(coalesce(p_limit, 5), 1), 20);
$$;
REVOKE ALL ON FUNCTION public.get_world_home_announcements(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_world_home_announcements(uuid, integer) TO authenticated;

-- ── 6. Les bandeaux portent étiquette, image et modification ─
DROP FUNCTION IF EXISTS public.get_world_banners(uuid);
CREATE OR REPLACE FUNCTION public.get_world_banners(p_world_id uuid)
RETURNS TABLE (
  id uuid, title text, body text, created_at timestamptz, signer text, signed_as_world boolean, is_test boolean,
  label text, image_url text, edited_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT x.id, x.title, x.body, x.created_at, x.signer, x.signed_as_world, x.is_test,
         x.label, x.image_url, x.edited_at
    FROM (
      -- L'essai d'abord : c'est celui qu'on vient de demander.
      (SELECT b.id, b.title, b.body, b.created_at, b.signer, b.signed_as_world, true AS is_test,
              NULL::text AS label, NULL::text AS image_url, NULL::timestamptz AS edited_at
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
              false,
              a.label, a.image_url, a.edited_at
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

-- ── 7. Avis au widget ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_world_home_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.world_announcements%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  -- Seules les annonces de l'accueil, avant ou après le changement.
  IF NOT (coalesce((CASE WHEN TG_OP <> 'INSERT' THEN OLD.show_on_home END), false)
          OR coalesce((CASE WHEN TG_OP <> 'DELETE' THEN NEW.show_on_home END), false)) THEN
    RETURN NULL;
  END IF;
  PERFORM public.wvlds_notify('world:' || r.world_id::text, 'announcement',
                              jsonb_build_object('op', TG_OP, 'id', r.id));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_world_home_announcement() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_broadcast_world_home_announcement ON public.world_announcements;
CREATE TRIGGER trg_broadcast_world_home_announcement
  AFTER INSERT OR UPDATE OR DELETE ON public.world_announcements
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_world_home_announcement();
