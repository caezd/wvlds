-- ─────────────────────────────────────────────────────────────
-- Migration 227 — Annonces d'un monde
--
-- L'équipe d'un monde peut écrire à tous ses membres, ou aux seuls porteurs
-- de certains rôles, de deux façons :
--   • « message » : un message privé envoyé depuis le compte de l'auteur à
--     chaque destinataire (la conversation est créée au besoin). Les
--     réponses arrivent dans ses messages privés, comme n'importe quel MP.
--   • « notification » : un titre et un texte, déposés dans la cloche de
--     chaque destinataire (type `world_announcement`), et poussés sur ses
--     appareils. Le texte complet voyage dans `metadata.body`.
--
-- Deux variables se remplacent pour chaque destinataire : `{username}` (son
-- pseudo) et `{world}` (le nom du monde).
--
-- Une permission de plus, `members.announce`, qu'aucun rôle existant ne
-- reçoit : le propriétaire et `administrator` l'ont d'office, le reste se
-- confie dans l'onglet Rôles. Écrire à tout un monde depuis son propre compte
-- est plus lourd que d'appeler @tous dans un salon (`mentions.everyone`).
--
-- Garde-fous : 10 annonces par monde sur 24 h glissantes ; un message privé
-- n'est jamais envoyé à qui a bloqué l'auteur (ni à qui l'auteur a bloqué),
-- comme `find_or_create_dm` ; les messages privés coupés par le drapeau
-- `direct_messages` refusent le mode « message ».
-- ─────────────────────────────────────────────────────────────

-- ── 1. La liste canonique des permissions ────────────────────
CREATE OR REPLACE FUNCTION public.world_permission_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    -- Général
    'administrator', 'world.settings', 'roles.manage', 'members.manage', 'members.announce',
    -- Salons
    'messages.post', 'chatrooms.create', 'chatrooms.manage', 'chatrooms.link', 'categories.manage',
    -- Contenu
    'wiki.edit', 'wiki.comment', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit', 'timeline.manage',
    -- Personas
    'relations.manage', 'personas.review', 'npc.manage', 'npc.play',
    -- Mentions
    'mentions.roles', 'mentions.everyone'
  ]::text[];
$$;

-- ── 2. L'historique des annonces ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_announcements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id        uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  author_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind            text NOT NULL,
  title           text,
  body            text NOT NULL,
  -- Vide : tous les membres.
  role_ids        uuid[] NOT NULL DEFAULT '{}'::uuid[],
  recipient_count integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_announcements_kind_check CHECK (kind IN ('message', 'notification')),
  CONSTRAINT world_announcements_title_len CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT world_announcements_title_kind CHECK ((kind = 'notification') = (title IS NOT NULL)),
  CONSTRAINT world_announcements_body_len CHECK (char_length(body) BETWEEN 1 AND 4000)
);

CREATE INDEX IF NOT EXISTS world_announcements_world_created
  ON public.world_announcements (world_id, created_at DESC);
CREATE INDEX IF NOT EXISTS world_announcements_author
  ON public.world_announcements (author_id) WHERE author_id IS NOT NULL;

ALTER TABLE public.world_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.world_announcements FROM anon;

-- Lecture seule pour qui peut annoncer ; l'écriture passe par la RPC.
DROP POLICY IF EXISTS world_announcements_select ON public.world_announcements;
CREATE POLICY world_announcements_select ON public.world_announcements
  FOR SELECT TO authenticated
  USING (public.has_world_permission(world_id, (select auth.uid()), 'members.announce'));

-- ── 3. Le type de notification ───────────────────────────────
-- Pas dans `notification_preferences` : une annonce de l'équipe ne se coupe
-- pas, comme une invitation.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite',
    'chatroom_reply', 'persona_new_chatroom', 'persona_reply', 'relation_request',
    'role_mention', 'everyone_mention', 'persona_submitted', 'persona_reviewed',
    'sequel_request', 'world_announcement'
  ));

-- ── 4. Les destinataires ─────────────────────────────────────
-- Fonction interne : les membres visés, l'auteur exclu, et pour un message
-- privé, sans les comptes bloqués dans un sens ou dans l'autre.
CREATE OR REPLACE FUNCTION public.world_announcement_targets(
  p_world_id uuid, p_author uuid, p_kind text, p_role_ids uuid[]
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT wm.user_id
    FROM public.world_members wm
   WHERE wm.world_id = p_world_id
     AND wm.user_id <> p_author
     AND (
       cardinality(coalesce(p_role_ids, '{}'::uuid[])) = 0
       OR EXISTS (
         SELECT 1 FROM public.world_member_roles mr
          WHERE mr.world_id = p_world_id
            AND mr.user_id = wm.user_id
            AND mr.role_id = ANY (p_role_ids)
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
$$;
REVOKE ALL ON FUNCTION public.world_announcement_targets(uuid, uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;

-- Le nombre de destinataires, pour le formulaire.
CREATE OR REPLACE FUNCTION public.count_world_announcement_recipients(
  p_world_id uuid, p_kind text, p_role_ids uuid[] DEFAULT '{}'::uuid[]
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
            FROM public.world_announcement_targets(p_world_id, v_uid, p_kind, p_role_ids));
END;
$$;
REVOKE ALL ON FUNCTION public.count_world_announcement_recipients(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_world_announcement_recipients(uuid, text, uuid[]) TO authenticated;

-- ── 5. L'envoi ───────────────────────────────────────────────
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

    INSERT INTO public.dm_messages (conversation_id, author_id, content)
    SELECT c.id, v_uid,
           left(replace(replace(v_body, '{username}', coalesce(p.username, '')), '{world}', v_world_name), 4000)
      FROM unnest(v_targets) t
      JOIN public.dm_conversations c
        ON c.participant_a = least(v_uid, t) AND c.participant_b = greatest(v_uid, t)
      LEFT JOIN public.profiles p ON p.id = t;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.dm_conversations c
       SET last_message_at = now()
     WHERE (c.participant_a, c.participant_b) IN (
       SELECT least(v_uid, t), greatest(v_uid, t) FROM unnest(v_targets) t
     );
  ELSE
    INSERT INTO public.notifications (recipient_id, type, world_id, actor_id, actor_name, content, metadata)
    SELECT t, 'world_announcement', p_world_id, v_uid, v_actor,
           left(replace(replace(v_title, '{username}', coalesce(p.username, '')), '{world}', v_world_name), 200),
           jsonb_build_object(
             'announcement_id', v_id,
             'world_name', v_world_name,
             'body', left(replace(replace(v_body, '{username}', coalesce(p.username, '')), '{world}', v_world_name), 4000)
           )
      FROM unnest(v_targets) t
      LEFT JOIN public.profiles p ON p.id = t;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  UPDATE public.world_announcements SET recipient_count = v_count WHERE id = v_id;

  RETURN jsonb_build_object('id', v_id, 'recipients', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.send_world_announcement(uuid, text, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_world_announcement(uuid, text, text, text, uuid[]) TO authenticated;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT 'members.announce' = ANY (public.world_permission_keys());                -- → true
-- SELECT count(*) FROM public.world_roles
--  WHERE NOT (permissions <@ public.world_permission_keys());                      -- → 0
-- SELECT has_function_privilege('anon', 'public.send_world_announcement(uuid,text,text,text,uuid[])', 'EXECUTE');   -- → false
-- SELECT has_function_privilege('authenticated', 'public.world_announcement_targets(uuid,uuid,text,uuid[])', 'EXECUTE'); -- → false
