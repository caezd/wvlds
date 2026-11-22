-- ─────────────────────────────────────────────────────────────
-- Migration 229 — Annonces : ciblage fin, retrait, bienvenue
--
-- 1. Ciblage fin. Une annonce accepte des filtres (`p_filters`, jsonb) :
--      • exclude_role_ids   : uuid[] — sauf les porteurs de ces rôles ;
--      • joined_within_days : entier — arrivés depuis moins de N jours ;
--      • inactive_days      : entier — aucun message dans le monde depuis
--                             N jours (l'activité se lit dans les salons du
--                             monde, pas dans `profiles.last_seen_at`, que le
--                             mode invisible n'écrit jamais).
--    Les filtres retenus sont gardés dans `world_announcements.filters`.
--    `count_world_announcement_recipients` et `send_world_announcement`
--    changent de signature : les anciennes sont supprimées (aucun client
--    déployé ne les appelait encore).
-- 2. Retrait. `retract_world_announcement` supprime les notifications
--    d'une annonce (pas les messages privés) et la marque retirée. Une
--    notification supprimée (non archivée) est désormais diffusée sur le
--    canal personnel, pour disparaître des cloches ouvertes.
-- 3. Bienvenue. `world_welcome_messages` : un modèle par monde, envoyé à
--    chaque nouveau membre (déclencheur sur `world_members`), en message
--    privé ou en notification, depuis le compte de la dernière personne à
--    l'avoir enregistré. Rien ne part si cette personne a perdu
--    `members.announce`. Le déclencheur n'empêche jamais une arrivée : une
--    erreur devient un avertissement.
-- ─────────────────────────────────────────────────────────────

-- ── 0. Colonnes et index ─────────────────────────────────────
ALTER TABLE public.world_announcements
  ADD COLUMN IF NOT EXISTS filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retracted_at timestamptz;

-- L'activité d'un membre dans un monde : son dernier message.
CREATE INDEX IF NOT EXISTS chat_messages_world_author_created
  ON public.chat_messages (world_id, author_id, created_at DESC);

-- ── 1. Filtres ───────────────────────────────────────────────
-- Ne garde que les clés connues ; les rôles exclus doivent être de CE monde ;
-- les durées vont de 1 à 3650 jours.
CREATE OR REPLACE FUNCTION public.world_announcement_normalize_filters(p_world_id uuid, p_filters jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_in      jsonb := coalesce(p_filters, '{}'::jsonb);
  v_out     jsonb := '{}'::jsonb;
  v_excl    uuid[];
  v_days    integer;
  v_key     text;
BEGIN
  IF jsonb_typeof(v_in) <> 'object' THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;

  IF v_in ? 'exclude_role_ids' THEN
    IF jsonb_typeof(v_in -> 'exclude_role_ids') <> 'array' THEN
      RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
    END IF;
    BEGIN
      SELECT coalesce(array_agg(r.id ORDER BY r.id), '{}'::uuid[]) INTO v_excl
        FROM public.world_roles r
       WHERE r.world_id = p_world_id
         AND r.id IN (SELECT e::uuid FROM jsonb_array_elements_text(v_in -> 'exclude_role_ids') e);
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
    END;
    IF cardinality(v_excl) > 0 THEN
      v_out := v_out || jsonb_build_object('exclude_role_ids', to_jsonb(v_excl));
    END IF;
  END IF;

  FOREACH v_key IN ARRAY ARRAY['joined_within_days', 'inactive_days'] LOOP
    IF v_in ? v_key AND jsonb_typeof(v_in -> v_key) <> 'null' THEN
      IF jsonb_typeof(v_in -> v_key) <> 'number' THEN
        RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
      END IF;
      v_days := (v_in ->> v_key)::numeric::integer;
      IF v_days NOT BETWEEN 1 AND 3650 THEN
        RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
      END IF;
      v_out := v_out || jsonb_build_object(v_key, v_days);
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.world_announcement_normalize_filters(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Les destinataires, filtres compris (ils doivent être déjà normalisés).
DROP FUNCTION IF EXISTS public.world_announcement_targets(uuid, uuid, text, uuid[]);
CREATE OR REPLACE FUNCTION public.world_announcement_targets(
  p_world_id uuid, p_author uuid, p_kind text, p_role_ids uuid[], p_filters jsonb
)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_excl     uuid[] := ARRAY(SELECT e::uuid FROM jsonb_array_elements_text(coalesce(p_filters -> 'exclude_role_ids', '[]'::jsonb)) e);
  v_joined   integer := (p_filters ->> 'joined_within_days')::integer;
  v_inactive integer := (p_filters ->> 'inactive_days')::integer;
BEGIN
  RETURN QUERY
  SELECT wm.user_id
    FROM public.world_members wm
   WHERE wm.world_id = p_world_id
     AND wm.user_id <> p_author
     AND (
       cardinality(coalesce(p_role_ids, '{}'::uuid[])) = 0
       OR EXISTS (
         SELECT 1 FROM public.world_member_roles mr
          WHERE mr.world_id = p_world_id AND mr.user_id = wm.user_id AND mr.role_id = ANY (p_role_ids)
       )
     )
     AND (
       cardinality(v_excl) = 0
       OR NOT EXISTS (
         SELECT 1 FROM public.world_member_roles mr
          WHERE mr.world_id = p_world_id AND mr.user_id = wm.user_id AND mr.role_id = ANY (v_excl)
       )
     )
     AND (v_joined IS NULL OR wm.joined_at > now() - make_interval(days => v_joined))
     AND (
       v_inactive IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.chat_messages m
          WHERE m.world_id = p_world_id
            AND m.author_id = wm.user_id
            AND m.created_at > now() - make_interval(days => v_inactive)
       )
     )
     AND (
       p_kind <> 'message'
       OR NOT EXISTS (
         SELECT 1 FROM public.user_blocks ub
          WHERE (ub.blocker_id = p_author AND ub.blocked_id = wm.user_id)
             OR (ub.blocker_id = wm.user_id AND ub.blocked_id = p_author)
       )
     );
END;
$$;
REVOKE ALL ON FUNCTION public.world_announcement_targets(uuid, uuid, text, uuid[], jsonb) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.count_world_announcement_recipients(uuid, text, uuid[]);
CREATE OR REPLACE FUNCTION public.count_world_announcement_recipients(
  p_world_id uuid, p_kind text, p_role_ids uuid[] DEFAULT '{}'::uuid[], p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
BEGIN
  IF NOT public.has_world_permission(p_world_id, v_uid, 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT count(*)::integer
            FROM public.world_announcement_targets(
              p_world_id, v_uid, p_kind, p_role_ids,
              public.world_announcement_normalize_filters(p_world_id, p_filters)));
END;
$$;
REVOKE ALL ON FUNCTION public.count_world_announcement_recipients(uuid, text, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_world_announcement_recipients(uuid, text, uuid[], jsonb) TO authenticated;

-- ── 1 bis. L'envoi, avec filtres ─────────────────────────────
DROP FUNCTION IF EXISTS public.send_world_announcement(uuid, text, text, text, uuid[]);
CREATE OR REPLACE FUNCTION public.send_world_announcement(
  p_world_id uuid,
  p_kind     text,
  p_title    text,
  p_body     text,
  p_role_ids uuid[] DEFAULT '{}'::uuid[],
  p_filters  jsonb DEFAULT '{}'::jsonb
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
  v_filters    jsonb;
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
    FROM public.world_announcement_targets(p_world_id, v_uid, p_kind, v_roles, v_filters) t;
  IF cardinality(v_targets) = 0 THEN
    RETURN jsonb_build_object('id', NULL, 'recipients', 0);
  END IF;

  SELECT p.username INTO v_actor FROM public.profiles p WHERE p.id = v_uid;

  INSERT INTO public.world_announcements (world_id, author_id, kind, title, body, role_ids, filters)
  VALUES (p_world_id, v_uid, p_kind, v_title, v_body, v_roles, v_filters)
  RETURNING id INTO v_id;

  IF p_kind = 'message' THEN
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
REVOKE ALL ON FUNCTION public.send_world_announcement(uuid, text, text, text, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_world_announcement(uuid, text, text, text, uuid[], jsonb) TO authenticated;

-- ── 2. Retrait ───────────────────────────────────────────────
-- Une notification supprimée encore visible (non archivée) est annoncée au
-- destinataire, comme une insertion ou une mise à jour.
CREATE OR REPLACE FUNCTION public.broadcast_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.archived_at IS NULL THEN
      PERFORM public.wvlds_notify('msgs:' || OLD.recipient_id::text, 'notification',
        jsonb_build_object('op', 'DELETE', 'id', OLD.id, 'chat_id', OLD.chat_id, 'archived', false));
    END IF;
    RETURN NULL;
  END IF;
  PERFORM public.wvlds_notify('msgs:' || NEW.recipient_id::text, 'notification',
    jsonb_build_object('op', TG_OP, 'id', NEW.id, 'chat_id', NEW.chat_id,
                       'archived', NEW.archived_at IS NOT NULL));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_notification ON public.notifications;
CREATE TRIGGER trg_broadcast_notification
  AFTER INSERT OR UPDATE OR DELETE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_notification();

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
  -- Un message privé reste dans les conversations : seules les
  -- notifications se retirent.
  IF v_ann.kind <> 'notification' OR v_ann.retracted_at IS NOT NULL THEN
    RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.notifications n
   USING public.world_announcement_recipients r
   WHERE r.announcement_id = p_announcement_id
     AND n.id = r.notification_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.world_announcements SET retracted_at = now() WHERE id = p_announcement_id;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.retract_world_announcement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retract_world_announcement(uuid) TO authenticated;

-- ── 3. Bienvenue ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_welcome_messages (
  world_id   uuid PRIMARY KEY REFERENCES public.worlds(id) ON DELETE CASCADE,
  enabled    boolean NOT NULL DEFAULT true,
  kind       text NOT NULL,
  title      text,
  body       text NOT NULL,
  -- L'expéditeur : la dernière personne à avoir enregistré le modèle.
  author_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_welcome_kind_check CHECK (kind IN ('message', 'notification')),
  CONSTRAINT world_welcome_title_len CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT world_welcome_title_kind CHECK ((kind = 'notification') = (title IS NOT NULL)),
  CONSTRAINT world_welcome_body_len CHECK (char_length(body) BETWEEN 1 AND 4000)
);
CREATE INDEX IF NOT EXISTS world_welcome_messages_author
  ON public.world_welcome_messages (author_id) WHERE author_id IS NOT NULL;

ALTER TABLE public.world_welcome_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.world_welcome_messages FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.world_welcome_messages FROM authenticated;

DROP POLICY IF EXISTS world_welcome_messages_select ON public.world_welcome_messages;
CREATE POLICY world_welcome_messages_select ON public.world_welcome_messages
  FOR SELECT TO authenticated
  USING (public.has_world_permission(world_id, (select auth.uid()), 'members.announce'));

-- Enregistrer (ou couper) le modèle. Couper ne demande pas de texte valide.
CREATE OR REPLACE FUNCTION public.save_world_welcome(
  p_world_id uuid,
  p_enabled  boolean,
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
  v_uid   uuid := (select auth.uid());
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body  text := btrim(coalesce(p_body, ''));
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.deleted_at IS NULL)
     OR NOT public.has_world_permission(p_world_id, v_uid, 'members.announce') THEN
    RAISE EXCEPTION 'Permission refusée.' USING ERRCODE = '42501';
  END IF;

  IF NOT coalesce(p_enabled, false) THEN
    UPDATE public.world_welcome_messages SET enabled = false, updated_at = now() WHERE world_id = p_world_id;
    RETURN;
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

  INSERT INTO public.world_welcome_messages (world_id, enabled, kind, title, body, author_id, updated_at)
  VALUES (p_world_id, true, p_kind, v_title, v_body, v_uid, now())
  ON CONFLICT (world_id) DO UPDATE
     SET enabled = true, kind = excluded.kind, title = excluded.title, body = excluded.body,
         author_id = excluded.author_id, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_world_welcome(uuid, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_world_welcome(uuid, boolean, text, text, text) TO authenticated;

-- L'envoi à l'arrivée d'un membre.
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
        NEW.user_id, 'world_announcement', NEW.world_id, v_cfg.author_id, v_actor,
        left(replace(replace(v_cfg.title, '{username}', coalesce(v_username, '')), '{world}', v_world_name), 200),
        jsonb_build_object('welcome', true, 'world_name', v_world_name, 'body', v_body)
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

DROP TRIGGER IF EXISTS trg_send_world_welcome ON public.world_members;
CREATE TRIGGER trg_send_world_welcome
  AFTER INSERT ON public.world_members
  FOR EACH ROW EXECUTE FUNCTION public.send_world_welcome();

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT has_function_privilege('anon', 'public.retract_world_announcement(uuid)', 'EXECUTE');                  -- → false
-- SELECT has_function_privilege('anon', 'public.save_world_welcome(uuid,boolean,text,text,text)', 'EXECUTE');   -- → false
-- SELECT has_function_privilege('authenticated', 'public.world_announcement_normalize_filters(uuid,jsonb)', 'EXECUTE'); -- → false
-- SELECT count(*) FROM pg_proc WHERE proname IN ('send_world_announcement', 'count_world_announcement_recipients'); -- → 2
