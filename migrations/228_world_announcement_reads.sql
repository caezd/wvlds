-- ─────────────────────────────────────────────────────────────
-- Migration 228 — Annonces : destinataires, lectures et essai
--
-- 1. `world_announcement_recipients` garde, pour chaque annonce, le message
--    privé ou la notification déposé chez chaque destinataire. On en tire le
--    nombre de lectures :
--      • notification : `read_at` renseigné ;
--      • message privé : le destinataire a ouvert la conversation depuis
--        l'envoi (`dm_reads.last_read_at` postérieur au message).
--    Table interne : aucune politique, seules les fonctions ci-dessous la
--    lisent ou l'écrivent.
-- 2. `send_world_announcement` remplit cette table (même signature).
-- 3. `world_announcement_read_counts` : les lectures des annonces demandées.
-- 4. `send_world_announcement_test` : l'auteur s'envoie l'annonce à lui-même,
--    toujours en notification (un message privé ne peut pas s'adresser à
--    soi-même : `dm_conversations` exige deux participants distincts). Les
--    essais ne comptent pas dans le plafond du monde et ne vont pas dans
--    l'historique ; 10 par heure et par personne.
--
-- Aucune annonce n'existait encore à l'application de cette migration :
-- rien à reprendre.
-- ─────────────────────────────────────────────────────────────

-- ── 1. Les destinataires de chaque annonce ───────────────────
CREATE TABLE IF NOT EXISTS public.world_announcement_recipients (
  announcement_id uuid NOT NULL REFERENCES public.world_announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  dm_message_id   bigint REFERENCES public.dm_messages(id) ON DELETE SET NULL,
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS world_announcement_recipients_user
  ON public.world_announcement_recipients (user_id);
CREATE INDEX IF NOT EXISTS world_announcement_recipients_notification
  ON public.world_announcement_recipients (notification_id) WHERE notification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS world_announcement_recipients_dm_message
  ON public.world_announcement_recipients (dm_message_id) WHERE dm_message_id IS NOT NULL;

ALTER TABLE public.world_announcement_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.world_announcement_recipients FROM anon, authenticated;

-- ── 2. L'envoi, qui note les destinataires ───────────────────
CREATE OR REPLACE FUNCTION public.send_world_announcement(
  p_world_id uuid,
  p_kind     text,
  p_title    text,
  p_body     text,
  p_role_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := (select auth.uid());
  v_world_name text;
  v_actor      text;
  v_title      text := nullif(btrim(coalesce(p_title, '')), '');
  v_body       text := btrim(coalesce(p_body, ''));
  v_roles      uuid[];
  v_targets    uuid[];
  v_id         uuid;
  v_count      integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.' USING ERRCODE = '42501';
  END IF;

  SELECT w.name INTO v_world_name
    FROM public.worlds w WHERE w.id = p_world_id AND w.deleted_at IS NULL;
  IF NOT FOUND OR NOT public.has_world_permission(p_world_id, v_uid, 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('message', 'notification') THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'message' THEN
    v_title := NULL;
    IF NOT coalesce((SELECT f.enabled FROM public.feature_flags f WHERE f.key = 'direct_messages'), true) THEN
      RAISE EXCEPTION 'announcement_dms_disabled' USING ERRCODE = '22023';
    END IF;
  ELSIF v_title IS NULL OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;

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
    FROM public.world_announcement_targets(p_world_id, v_uid, p_kind, v_roles) t;
  IF cardinality(v_targets) = 0 THEN
    RETURN jsonb_build_object('id', NULL, 'recipients', 0);
  END IF;

  SELECT p.username INTO v_actor FROM public.profiles p WHERE p.id = v_uid;

  INSERT INTO public.world_announcements (world_id, author_id, kind, title, body, role_ids)
  VALUES (p_world_id, v_uid, p_kind, v_title, v_body, v_roles)
  RETURNING id INTO v_id;

  IF p_kind = 'message' THEN
    -- Les conversations manquantes, dans l'ordre exigé par
    -- `dm_conversations` (participant_a < participant_b).
    INSERT INTO public.dm_conversations (participant_a, participant_b)
    SELECT least(v_uid, t), greatest(v_uid, t) FROM unnest(v_targets) t
    ON CONFLICT (participant_a, participant_b) DO NOTHING;

    WITH sent AS (
      INSERT INTO public.dm_messages (conversation_id, author_id, content)
      SELECT c.id, v_uid,
             left(replace(replace(v_body, '{username}', coalesce(p.username, '')), '{world}', v_world_name), 4000)
        FROM unnest(v_targets) t
        JOIN public.dm_conversations c
          ON c.participant_a = least(v_uid, t) AND c.participant_b = greatest(v_uid, t)
        LEFT JOIN public.profiles p ON p.id = t
      RETURNING id, conversation_id
    )
    INSERT INTO public.world_announcement_recipients (announcement_id, user_id, dm_message_id)
    SELECT v_id,
           CASE WHEN c.participant_a = v_uid THEN c.participant_b ELSE c.participant_a END,
           s.id
      FROM sent s
      JOIN public.dm_conversations c ON c.id = s.conversation_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.dm_conversations c
       SET last_message_at = now()
     WHERE (c.participant_a, c.participant_b) IN (
       SELECT least(v_uid, t), greatest(v_uid, t) FROM unnest(v_targets) t
     );
  ELSE
    WITH sent AS (
      INSERT INTO public.notifications (recipient_id, type, world_id, actor_id, actor_name, content, metadata)
      SELECT t, 'world_announcement', p_world_id, v_uid, v_actor,
             left(replace(replace(v_title, '{username}', coalesce(p.username, '')), '{world}', v_world_name), 200),
             jsonb_build_object(
               'announcement_id', v_id,
               'world_name', v_world_name,
               'body', left(replace(replace(v_body, '{username}', coalesce(p.username, '')), '{world}', v_world_name), 4000)
             )
        FROM unnest(v_targets) t
        LEFT JOIN public.profiles p ON p.id = t
      RETURNING id, recipient_id
    )
    INSERT INTO public.world_announcement_recipients (announcement_id, user_id, notification_id)
    SELECT v_id, s.recipient_id, s.id FROM sent s;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  UPDATE public.world_announcements SET recipient_count = v_count WHERE id = v_id;

  RETURN jsonb_build_object('id', v_id, 'recipients', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.send_world_announcement(uuid, text, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_world_announcement(uuid, text, text, text, uuid[]) TO authenticated;

-- ── 3. Les lectures ──────────────────────────────────────────
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
REVOKE ALL ON FUNCTION public.world_announcement_read_counts(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.world_announcement_read_counts(uuid, uuid[]) TO authenticated;

-- ── 4. L'essai à soi-même ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_world_announcement_test(
  p_world_id uuid,
  p_kind     text,
  p_title    text,
  p_body     text
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
  v_title      text := nullif(btrim(coalesce(p_title, '')), '');
  v_body       text := btrim(coalesce(p_body, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.' USING ERRCODE = '42501';
  END IF;

  SELECT w.name INTO v_world_name
    FROM public.worlds w WHERE w.id = p_world_id AND w.deleted_at IS NULL;
  IF NOT FOUND OR NOT public.has_world_permission(p_world_id, v_uid, 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('message', 'notification') THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'message' THEN
    v_title := NULL;
  ELSIF v_title IS NULL OR char_length(v_title) > 120 THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
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
    v_uid, 'world_announcement', p_world_id, v_uid, v_actor,
    left(replace(replace(v_title, '{username}', coalesce(v_actor, '')), '{world}', v_world_name), 200),
    jsonb_build_object(
      'test', true,
      'kind', p_kind,
      'world_name', v_world_name,
      'body', left(replace(replace(v_body, '{username}', coalesce(v_actor, '')), '{world}', v_world_name), 4000)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.send_world_announcement_test(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_world_announcement_test(uuid, text, text, text) TO authenticated;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT has_table_privilege('authenticated', 'public.world_announcement_recipients', 'SELECT');                -- → false
-- SELECT has_function_privilege('anon', 'public.send_world_announcement_test(uuid,text,text,text)', 'EXECUTE'); -- → false
-- SELECT has_function_privilege('anon', 'public.world_announcement_read_counts(uuid,uuid[])', 'EXECUTE');        -- → false
