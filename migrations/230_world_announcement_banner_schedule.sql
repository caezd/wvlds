-- ─────────────────────────────────────────────────────────────
-- Migration 230 — Annonces : bandeau, signature du monde, programmation
--
-- 1. Un troisième mode, « banner » (le bandeau) : un titre et un texte
--    affichés en haut de l'accueil du monde, chez chaque destinataire,
--    jusqu'à ce qu'il le ferme (ou jusqu'à `banner_until`). Pas de push.
--    Les destinataires sont notés dans `world_announcement_recipients` ;
--    `dismissed_at` dit qui l'a fermé, et compte comme une lecture.
-- 2. Signer au nom du monde (`signed_as_world`) : une notification ou un
--    bandeau montre le monde comme auteur, pas le compte qui l'a écrit.
--    L'historique garde l'auteur. Impossible pour un message privé, qui part
--    forcément d'un compte.
-- 3. Programmer un envoi : `world_scheduled_announcements`, traitée chaque
--    minute par pg_cron (`process_scheduled_world_announcements`). L'envoi
--    se fait au nom de l'auteur, avec ses droits du moment ; le plafond
--    journalier s'applique à l'heure de l'envoi. 20 envois en attente par
--    monde, au plus 90 jours à l'avance.
--
-- L'envoi est extrait dans `world_announcement_dispatch(p_uid, …)`, interne,
-- que la RPC (auth.uid()) et la tâche planifiée (l'auteur) appellent.
-- ─────────────────────────────────────────────────────────────

-- ── 0. Colonnes ──────────────────────────────────────────────
ALTER TABLE public.world_announcements DROP CONSTRAINT IF EXISTS world_announcements_kind_check;
ALTER TABLE public.world_announcements
  ADD CONSTRAINT world_announcements_kind_check CHECK (kind IN ('message', 'notification', 'banner'));
ALTER TABLE public.world_announcements DROP CONSTRAINT IF EXISTS world_announcements_title_kind;
ALTER TABLE public.world_announcements
  ADD CONSTRAINT world_announcements_title_kind CHECK ((kind <> 'message') = (title IS NOT NULL));
ALTER TABLE public.world_announcements
  ADD COLUMN IF NOT EXISTS signed_as_world boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banner_until timestamptz;
ALTER TABLE public.world_announcements DROP CONSTRAINT IF EXISTS world_announcements_world_sign;
ALTER TABLE public.world_announcements
  ADD CONSTRAINT world_announcements_world_sign CHECK (NOT signed_as_world OR kind <> 'message');

ALTER TABLE public.world_announcement_recipients
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

ALTER TABLE public.world_welcome_messages
  ADD COLUMN IF NOT EXISTS signed_as_world boolean NOT NULL DEFAULT false;
ALTER TABLE public.world_welcome_messages DROP CONSTRAINT IF EXISTS world_welcome_world_sign;
ALTER TABLE public.world_welcome_messages
  ADD CONSTRAINT world_welcome_world_sign CHECK (NOT signed_as_world OR kind <> 'message');

-- ── 1. Validation commune ────────────────────────────────────
-- Rend le titre normalisé (NULL pour un message privé) ou lève
-- `announcement_invalid` / `announcement_dms_disabled`.
CREATE OR REPLACE FUNCTION public.world_announcement_validate(
  p_kind text, p_title text, p_body text, p_as_world boolean, p_banner_days integer
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('message', 'notification', 'banner') THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'message' THEN
    IF coalesce(p_as_world, false) THEN
      RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
    END IF;
    IF NOT coalesce((SELECT f.enabled FROM public.feature_flags f WHERE f.key = 'direct_messages'), true) THEN
      RAISE EXCEPTION 'announcement_dms_disabled' USING ERRCODE = '22023';
    END IF;
    v_title := NULL;
  ELSIF v_title IS NULL OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(p_body, ''))) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_banner_days IS NOT NULL AND (p_kind <> 'banner' OR p_banner_days NOT BETWEEN 1 AND 365) THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;
  RETURN v_title;
END;
$$;
REVOKE ALL ON FUNCTION public.world_announcement_validate(text, text, text, boolean, integer) FROM PUBLIC, anon, authenticated;

-- ── 2. L'envoi, pour un auteur donné ─────────────────────────
CREATE OR REPLACE FUNCTION public.world_announcement_dispatch(
  p_uid         uuid,
  p_world_id    uuid,
  p_kind        text,
  p_title       text,
  p_body        text,
  p_role_ids    uuid[],
  p_filters     jsonb,
  p_as_world    boolean,
  p_banner_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_world_name text;
  v_actor      text;
  v_title      text;
  v_body       text := btrim(coalesce(p_body, ''));
  v_as_world   boolean := coalesce(p_as_world, false);
  v_roles      uuid[];
  v_filters    jsonb;
  v_targets    uuid[];
  v_id         uuid;
  v_count      integer := 0;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.' USING ERRCODE = '42501';
  END IF;

  SELECT w.name INTO v_world_name
    FROM public.worlds w WHERE w.id = p_world_id AND w.deleted_at IS NULL;
  IF NOT FOUND OR NOT public.has_world_permission(p_world_id, p_uid, 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;

  v_title := public.world_announcement_validate(p_kind, p_title, p_body, v_as_world, p_banner_days);
  v_filters := public.world_announcement_normalize_filters(p_world_id, p_filters);

  -- Verrou par monde : deux envois simultanés ne contournent pas le plafond.
  PERFORM pg_advisory_xact_lock(hashtextextended('world_announcement:' || p_world_id::text, 0));
  IF (SELECT count(*) FROM public.world_announcements a
       WHERE a.world_id = p_world_id AND a.created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'announcement_rate_limit' USING ERRCODE = 'P0001';
  END IF;

  -- Seuls les rôles de CE monde comptent.
  SELECT coalesce(array_agg(r.id), '{}'::uuid[]) INTO v_roles
    FROM public.world_roles r
   WHERE r.world_id = p_world_id AND r.id = ANY (coalesce(p_role_ids, '{}'::uuid[]));
  -- Des rôles demandés mais aucun de ce monde : ne pas retomber sur « tous ».
  IF cardinality(coalesce(p_role_ids, '{}'::uuid[])) > 0 AND cardinality(v_roles) = 0 THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(t), '{}'::uuid[]) INTO v_targets
    FROM public.world_announcement_targets(p_world_id, p_uid, p_kind, v_roles, v_filters) t;
  IF cardinality(v_targets) = 0 THEN
    RETURN jsonb_build_object('id', NULL, 'recipients', 0);
  END IF;

  SELECT p.username INTO v_actor FROM public.profiles p WHERE p.id = p_uid;

  INSERT INTO public.world_announcements
    (world_id, author_id, kind, title, body, role_ids, filters, signed_as_world, banner_until)
  VALUES
    (p_world_id, p_uid, p_kind, v_title, v_body, v_roles, v_filters, v_as_world,
     CASE WHEN p_kind = 'banner' AND p_banner_days IS NOT NULL THEN now() + make_interval(days => p_banner_days) END)
  RETURNING id INTO v_id;

  IF p_kind = 'message' THEN
    INSERT INTO public.dm_conversations (participant_a, participant_b)
    SELECT least(p_uid, t), greatest(p_uid, t) FROM unnest(v_targets) t
    ON CONFLICT (participant_a, participant_b) DO NOTHING;

    WITH sent AS (
      INSERT INTO public.dm_messages (conversation_id, author_id, content)
      SELECT c.id, p_uid,
             left(replace(replace(v_body, '{username}', coalesce(p.username, '')), '{world}', v_world_name), 4000)
        FROM unnest(v_targets) t
        JOIN public.dm_conversations c
          ON c.participant_a = least(p_uid, t) AND c.participant_b = greatest(p_uid, t)
        LEFT JOIN public.profiles p ON p.id = t
      RETURNING id, conversation_id
    )
    INSERT INTO public.world_announcement_recipients (announcement_id, user_id, dm_message_id)
    SELECT v_id,
           CASE WHEN c.participant_a = p_uid THEN c.participant_b ELSE c.participant_a END,
           s.id
      FROM sent s
      JOIN public.dm_conversations c ON c.id = s.conversation_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.dm_conversations c
       SET last_message_at = now()
     WHERE (c.participant_a, c.participant_b) IN (
       SELECT least(p_uid, t), greatest(p_uid, t) FROM unnest(v_targets) t
     );
  ELSIF p_kind = 'notification' THEN
    WITH sent AS (
      INSERT INTO public.notifications (recipient_id, type, world_id, actor_id, actor_name, content, metadata)
      SELECT t, 'world_announcement', p_world_id,
             CASE WHEN v_as_world THEN NULL ELSE p_uid END,
             CASE WHEN v_as_world THEN v_world_name ELSE v_actor END,
             left(replace(replace(v_title, '{username}', coalesce(p.username, '')), '{world}', v_world_name), 200),
             jsonb_build_object(
               'announcement_id', v_id,
               'world_name', v_world_name,
               'signed_as_world', v_as_world,
               'body', left(replace(replace(v_body, '{username}', coalesce(p.username, '')), '{world}', v_world_name), 4000)
             )
        FROM unnest(v_targets) t
        LEFT JOIN public.profiles p ON p.id = t
      RETURNING id, recipient_id
    )
    INSERT INTO public.world_announcement_recipients (announcement_id, user_id, notification_id)
    SELECT v_id, s.recipient_id, s.id FROM sent s;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    -- Bandeau : les variables se remplacent à la lecture (get_world_banners).
    INSERT INTO public.world_announcement_recipients (announcement_id, user_id)
    SELECT v_id, t FROM unnest(v_targets) t;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    PERFORM public.wvlds_notify('msgs:' || t::text, 'world_banner', jsonb_build_object('world_id', p_world_id))
       FROM unnest(v_targets) t;
  END IF;

  UPDATE public.world_announcements SET recipient_count = v_count WHERE id = v_id;

  RETURN jsonb_build_object('id', v_id, 'recipients', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.world_announcement_dispatch(uuid, uuid, text, text, text, uuid[], jsonb, boolean, integer) FROM PUBLIC, anon, authenticated;

-- ── 3. La RPC d'envoi ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.send_world_announcement(uuid, text, text, text, uuid[], jsonb);
CREATE OR REPLACE FUNCTION public.send_world_announcement(
  p_world_id    uuid,
  p_kind        text,
  p_title       text,
  p_body        text,
  p_role_ids    uuid[] DEFAULT '{}'::uuid[],
  p_filters     jsonb DEFAULT '{}'::jsonb,
  p_as_world    boolean DEFAULT false,
  p_banner_days integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.world_announcement_dispatch(
    (select auth.uid()), p_world_id, p_kind, p_title, p_body, p_role_ids, p_filters, p_as_world, p_banner_days);
$$;
REVOKE ALL ON FUNCTION public.send_world_announcement(uuid, text, text, text, uuid[], jsonb, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_world_announcement(uuid, text, text, text, uuid[], jsonb, boolean, integer) TO authenticated;

-- ── 4. L'essai : bandeau et signature du monde ───────────────
DROP FUNCTION IF EXISTS public.send_world_announcement_test(uuid, text, text, text);
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
         AND (n.metadata ->> 'test') = 'true') >= 10 THEN
    RAISE EXCEPTION 'announcement_test_rate_limit' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.username INTO v_actor FROM public.profiles p WHERE p.id = v_uid;

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

-- ── 5. Lectures : un bandeau fermé compte ────────────────────
CREATE OR REPLACE FUNCTION public.world_announcement_read_counts(p_world_id uuid, p_ids uuid[])
RETURNS TABLE (announcement_id uuid, read_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_world_permission(p_world_id, (select auth.uid()), 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.announcement_id,
         (count(*) FILTER (
            WHERE n.read_at IS NOT NULL
               OR r.dismissed_at IS NOT NULL
               OR EXISTS (
                 SELECT 1 FROM public.dm_reads d
                  WHERE d.conversation_id = m.conversation_id
                    AND d.user_id = r.user_id
                    AND d.last_read_at >= m.created_at
               )
          ))::integer
    FROM public.world_announcement_recipients r
    JOIN public.world_announcements a ON a.id = r.announcement_id AND a.world_id = p_world_id
    LEFT JOIN public.notifications n ON n.id = r.notification_id
    LEFT JOIN public.dm_messages m ON m.id = r.dm_message_id
   WHERE r.announcement_id = ANY (coalesce(p_ids, '{}'::uuid[]))
   GROUP BY r.announcement_id;
END;
$$;

-- ── 6. Retrait : notifications et bandeaux ───────────────────
CREATE OR REPLACE FUNCTION public.retract_world_announcement(p_announcement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := (select auth.uid());
  v_ann   public.world_announcements%ROWTYPE;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_ann FROM public.world_announcements WHERE id = p_announcement_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_world_permission(v_ann.world_id, v_uid, 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;
  -- Un message privé reste dans les conversations.
  IF v_ann.kind = 'message' OR v_ann.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;

  IF v_ann.kind = 'notification' THEN
    DELETE FROM public.notifications n
     USING public.world_announcement_recipients r
     WHERE r.announcement_id = p_announcement_id
       AND n.id = r.notification_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    -- Bandeau : ceux qui ne l'ont pas encore fermé le voient disparaître.
    SELECT count(*) INTO v_count FROM public.world_announcement_recipients r
     WHERE r.announcement_id = p_announcement_id AND r.dismissed_at IS NULL;
    PERFORM public.wvlds_notify('msgs:' || r.user_id::text, 'world_banner', jsonb_build_object('world_id', v_ann.world_id))
       FROM public.world_announcement_recipients r
      WHERE r.announcement_id = p_announcement_id AND r.dismissed_at IS NULL;
  END IF;

  UPDATE public.world_announcements SET retracted_at = now() WHERE id = p_announcement_id;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.retract_world_announcement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retract_world_announcement(uuid) TO authenticated;

-- ── 7. Les bandeaux d'un membre ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_world_banners(p_world_id uuid)
RETURNS TABLE (id uuid, title text, body text, created_at timestamptz, signer text, signed_as_world boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id,
         replace(replace(a.title, '{username}', coalesce(me.username, '')), '{world}', w.name),
         replace(replace(a.body, '{username}', coalesce(me.username, '')), '{world}', w.name),
         a.created_at,
         CASE WHEN a.signed_as_world THEN w.name ELSE au.username END,
         a.signed_as_world
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
   LIMIT 3;
$$;
REVOKE ALL ON FUNCTION public.get_world_banners(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_world_banners(uuid) TO authenticated;

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
$$;
REVOKE ALL ON FUNCTION public.dismiss_world_banner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_world_banner(uuid) TO authenticated;

-- ── 8. Envois programmés ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_scheduled_announcements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id        uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  -- L'envoi part au nom de l'auteur : sans lui, plus rien à envoyer.
  author_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  title           text,
  body            text NOT NULL,
  role_ids        uuid[] NOT NULL DEFAULT '{}'::uuid[],
  filters         jsonb NOT NULL DEFAULT '{}'::jsonb,
  signed_as_world boolean NOT NULL DEFAULT false,
  banner_days     integer,
  scheduled_for   timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  announcement_id uuid REFERENCES public.world_announcements(id) ON DELETE SET NULL,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  CONSTRAINT world_scheduled_kind_check CHECK (kind IN ('message', 'notification', 'banner')),
  CONSTRAINT world_scheduled_status_check CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  CONSTRAINT world_scheduled_body_len CHECK (char_length(body) BETWEEN 1 AND 4000)
);
CREATE INDEX IF NOT EXISTS world_scheduled_announcements_due
  ON public.world_scheduled_announcements (scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS world_scheduled_announcements_world
  ON public.world_scheduled_announcements (world_id, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS world_scheduled_announcements_author
  ON public.world_scheduled_announcements (author_id);
CREATE INDEX IF NOT EXISTS world_scheduled_announcements_announcement
  ON public.world_scheduled_announcements (announcement_id) WHERE announcement_id IS NOT NULL;

ALTER TABLE public.world_scheduled_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.world_scheduled_announcements FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.world_scheduled_announcements FROM authenticated;

DROP POLICY IF EXISTS world_scheduled_announcements_select ON public.world_scheduled_announcements;
CREATE POLICY world_scheduled_announcements_select ON public.world_scheduled_announcements
  FOR SELECT TO authenticated
  USING (public.has_world_permission(world_id, (select auth.uid()), 'members.announce'));

CREATE OR REPLACE FUNCTION public.schedule_world_announcement(
  p_world_id      uuid,
  p_kind          text,
  p_title         text,
  p_body          text,
  p_role_ids      uuid[],
  p_filters       jsonb,
  p_as_world      boolean,
  p_banner_days   integer,
  p_scheduled_for timestamptz
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
  v_id      uuid;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.deleted_at IS NULL)
     OR NOT public.has_world_permission(p_world_id, v_uid, 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;

  v_title := public.world_announcement_validate(p_kind, p_title, p_body, p_as_world, p_banner_days);
  v_filters := public.world_announcement_normalize_filters(p_world_id, p_filters);
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
    (world_id, author_id, kind, title, body, role_ids, filters, signed_as_world, banner_days, scheduled_for)
  VALUES
    (p_world_id, v_uid, p_kind, v_title, btrim(p_body), v_roles, v_filters, coalesce(p_as_world, false),
     p_banner_days, p_scheduled_for)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.schedule_world_announcement(uuid, text, text, text, uuid[], jsonb, boolean, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_world_announcement(uuid, text, text, text, uuid[], jsonb, boolean, integer, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_world_announcement(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.world_scheduled_announcements%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.world_scheduled_announcements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.has_world_permission(v_row.world_id, (select auth.uid()), 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;
  UPDATE public.world_scheduled_announcements
     SET status = 'cancelled', processed_at = now()
   WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_scheduled_world_announcement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_scheduled_world_announcement(uuid) TO authenticated;

-- Appelée chaque minute par pg_cron. Chaque envoi est isolé : un échec
-- (droits perdus, plafond, plus aucun destinataire) est noté sur sa ligne.
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

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'process-scheduled-announcements';
  PERFORM cron.schedule('process-scheduled-announcements', '* * * * *',
                        'SELECT public.process_scheduled_world_announcements()');
END $$;

-- ── 9. Bienvenue signée par le monde ─────────────────────────
DROP FUNCTION IF EXISTS public.save_world_welcome(uuid, boolean, text, text, text);
CREATE OR REPLACE FUNCTION public.save_world_welcome(
  p_world_id uuid,
  p_enabled  boolean,
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
  v_uid   uuid := (select auth.uid());
  v_title text;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.deleted_at IS NULL)
     OR NOT public.has_world_permission(p_world_id, v_uid, 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;

  IF NOT coalesce(p_enabled, false) THEN
    UPDATE public.world_welcome_messages SET enabled = false, updated_at = now() WHERE world_id = p_world_id;
    RETURN;
  END IF;

  -- Pas de bandeau de bienvenue : l'accueil d'un nouveau membre est déjà lu.
  IF p_kind NOT IN ('message', 'notification') THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;
  v_title := public.world_announcement_validate(p_kind, p_title, p_body, p_as_world, NULL);

  INSERT INTO public.world_welcome_messages (world_id, enabled, kind, title, body, signed_as_world, author_id, updated_at)
  VALUES (p_world_id, true, p_kind, v_title, btrim(p_body), coalesce(p_as_world, false), v_uid, now())
  ON CONFLICT (world_id) DO UPDATE
     SET enabled = true, kind = excluded.kind, title = excluded.title, body = excluded.body,
         signed_as_world = excluded.signed_as_world, author_id = excluded.author_id, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_world_welcome(uuid, boolean, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_world_welcome(uuid, boolean, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_world_welcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cfg        public.world_welcome_messages%ROWTYPE;
  v_world_name text;
  v_username   text;
  v_actor      text;
  v_body       text;
  v_conv       uuid;
BEGIN
  SELECT * INTO v_cfg FROM public.world_welcome_messages WHERE world_id = NEW.world_id AND enabled;
  IF NOT FOUND OR v_cfg.author_id IS NULL OR v_cfg.author_id = NEW.user_id THEN
    RETURN NULL;
  END IF;

  BEGIN
    IF NOT public.has_world_permission(NEW.world_id, v_cfg.author_id, 'members.announce') THEN
      RETURN NULL;
    END IF;
    SELECT w.name INTO v_world_name FROM public.worlds w WHERE w.id = NEW.world_id AND w.deleted_at IS NULL;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;
    SELECT p.username INTO v_username FROM public.profiles p WHERE p.id = NEW.user_id;
    SELECT p.username INTO v_actor FROM public.profiles p WHERE p.id = v_cfg.author_id;
    v_body := left(replace(replace(v_cfg.body, '{username}', coalesce(v_username, '')), '{world}', v_world_name), 4000);

    IF v_cfg.kind = 'message' THEN
      IF NOT coalesce((SELECT f.enabled FROM public.feature_flags f WHERE f.key = 'direct_messages'), true)
         OR EXISTS (
           SELECT 1 FROM public.user_blocks ub
            WHERE (ub.blocker_id = v_cfg.author_id AND ub.blocked_id = NEW.user_id)
               OR (ub.blocker_id = NEW.user_id AND ub.blocked_id = v_cfg.author_id)
         ) THEN
        RETURN NULL;
      END IF;
      INSERT INTO public.dm_conversations (participant_a, participant_b)
      VALUES (least(v_cfg.author_id, NEW.user_id), greatest(v_cfg.author_id, NEW.user_id))
      ON CONFLICT (participant_a, participant_b) DO NOTHING;
      SELECT c.id INTO v_conv FROM public.dm_conversations c
       WHERE c.participant_a = least(v_cfg.author_id, NEW.user_id)
         AND c.participant_b = greatest(v_cfg.author_id, NEW.user_id);
      INSERT INTO public.dm_messages (conversation_id, author_id, content) VALUES (v_conv, v_cfg.author_id, v_body);
      UPDATE public.dm_conversations SET last_message_at = now() WHERE id = v_conv;
    ELSE
      INSERT INTO public.notifications (recipient_id, type, world_id, actor_id, actor_name, content, metadata)
      VALUES (
        NEW.user_id, 'world_announcement', NEW.world_id,
        CASE WHEN v_cfg.signed_as_world THEN NULL ELSE v_cfg.author_id END,
        CASE WHEN v_cfg.signed_as_world THEN v_world_name ELSE v_actor END,
        left(replace(replace(v_cfg.title, '{username}', coalesce(v_username, '')), '{world}', v_world_name), 200),
        jsonb_build_object('welcome', true, 'world_name', v_world_name, 'signed_as_world', v_cfg.signed_as_world, 'body', v_body)
      );
    END IF;

    UPDATE public.world_welcome_messages SET sent_count = sent_count + 1 WHERE world_id = NEW.world_id;
  EXCEPTION WHEN OTHERS THEN
    -- Une arrivée ne doit jamais échouer à cause du message de bienvenue.
    RAISE WARNING 'send_world_welcome(%, %) : %', NEW.world_id, NEW.user_id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.send_world_welcome() FROM PUBLIC, anon, authenticated;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT jobname, schedule FROM cron.job WHERE jobname = 'process-scheduled-announcements'; -- → * * * * *
-- SELECT has_function_privilege('authenticated', 'public.world_announcement_dispatch(uuid,uuid,text,text,text,uuid[],jsonb,boolean,integer)', 'EXECUTE'); -- → false
-- SELECT has_function_privilege('authenticated', 'public.process_scheduled_world_announcements()', 'EXECUTE'); -- → false
-- SELECT count(*) FROM pg_proc WHERE proname IN ('send_world_announcement', 'send_world_announcement_test', 'save_world_welcome'); -- → 3
