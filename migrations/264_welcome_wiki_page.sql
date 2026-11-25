-- ============================================================
-- Migration 264 — Message de bienvenue : une page du wiki à lire
-- ============================================================
-- Le message de bienvenue envoyé en notification peut proposer une page du
-- wiki (un guide pour les nouveaux membres, par exemple) : un bouton dans la
-- notification ouverte, à la place de « Ouvrir le monde », inutile à un
-- membre qui vient d'entrer. Un message privé reste du texte simple : pas de
-- page liée.
--
-- La page est gardée par son id ; son adresse (slug) et son titre sont lus à
-- l'envoi, pour suivre un renommage. Elle n'est proposée que si tout membre
-- peut la lire : publiée, non restreinte, ni dossier ni supprimée. Sinon la
-- notification part sans bouton.
--
-- Écritures par RPC seulement (la table n'a aucun droit d'écriture client,
-- migration 229) : pas de GRANT UPDATE à ajouter.

ALTER TABLE public.world_welcome_messages
  ADD COLUMN IF NOT EXISTS wiki_page_id uuid REFERENCES public.world_wiki_pages(id) ON DELETE SET NULL;
ALTER TABLE public.world_welcome_messages DROP CONSTRAINT IF EXISTS world_welcome_wiki_page_kind;
ALTER TABLE public.world_welcome_messages
  ADD CONSTRAINT world_welcome_wiki_page_kind CHECK (wiki_page_id IS NULL OR kind = 'notification');
CREATE INDEX IF NOT EXISTS world_welcome_messages_wiki_page
  ON public.world_welcome_messages (wiki_page_id) WHERE wiki_page_id IS NOT NULL;

-- La page telle que la notification la porte, ou NULL si un membre ne peut
-- pas la lire.
CREATE OR REPLACE FUNCTION public.welcome_wiki_page(p_world_id uuid, p_page_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('slug', p.slug, 'title', p.title)
    FROM public.world_wiki_pages p
   WHERE p.id = p_page_id
     AND p.world_id = p_world_id
     AND NOT p.is_folder
     AND p.deleted_at IS NULL
     AND NOT coalesce(p.is_restricted, false)
     AND p.published_at IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.welcome_wiki_page(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── Enregistrer le modèle ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.save_world_welcome(uuid, boolean, text, text, text, boolean);
CREATE OR REPLACE FUNCTION public.save_world_welcome(
  p_world_id     uuid,
  p_enabled      boolean,
  p_kind         text,
  p_title        text,
  p_body         text,
  p_as_world     boolean DEFAULT false,
  p_wiki_page_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := (select auth.uid());
  v_title text;
  v_page  uuid;
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
  v_title := public.world_announcement_validate(p_kind, p_title, p_body, p_as_world, NULL);

  -- Une page liée : notification seulement, lisible par tout membre.
  IF p_kind = 'notification' AND p_wiki_page_id IS NOT NULL THEN
    IF public.welcome_wiki_page(p_world_id, p_wiki_page_id) IS NULL THEN
      RAISE EXCEPTION 'announcement_invalid' USING ERRCODE = '22023';
    END IF;
    v_page := p_wiki_page_id;
  END IF;

  INSERT INTO public.world_welcome_messages (world_id, enabled, kind, title, body, signed_as_world, wiki_page_id, author_id, updated_at)
  VALUES (p_world_id, true, p_kind, v_title, btrim(p_body), coalesce(p_as_world, false), v_page, v_uid, now())
  ON CONFLICT (world_id) DO UPDATE
     SET enabled = true, kind = excluded.kind, title = excluded.title, body = excluded.body,
         signed_as_world = excluded.signed_as_world, wiki_page_id = excluded.wiki_page_id,
         author_id = excluded.author_id, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_world_welcome(uuid, boolean, text, text, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_world_welcome(uuid, boolean, text, text, text, boolean, uuid) TO authenticated;

-- ── Envoi à un nouveau membre ───────────────────────────────────────────
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
  v_page       jsonb;
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
      IF v_cfg.wiki_page_id IS NOT NULL THEN
        v_page := public.welcome_wiki_page(NEW.world_id, v_cfg.wiki_page_id);
      END IF;
      INSERT INTO public.notifications (recipient_id, type, world_id, actor_id, actor_name, content, metadata)
      VALUES (
        NEW.user_id, 'world_announcement', NEW.world_id,
        CASE WHEN v_cfg.signed_as_world THEN NULL ELSE v_cfg.author_id END,
        CASE WHEN v_cfg.signed_as_world THEN v_world_name ELSE v_actor END,
        left(replace(replace(v_cfg.title, '{username}', coalesce(v_username, '')), '{world}', v_world_name), 200),
        jsonb_build_object('welcome', true, 'world_name', v_world_name, 'signed_as_world', v_cfg.signed_as_world, 'body', v_body)
          || CASE WHEN v_page IS NOT NULL THEN jsonb_build_object('wiki_page', v_page) ELSE '{}'::jsonb END
      );
    END IF;

    UPDATE public.world_welcome_messages SET sent_count = sent_count + 1 WHERE world_id = NEW.world_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'send_world_welcome(%, %) : %', NEW.world_id, NEW.user_id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.send_world_welcome() FROM PUBLIC, anon, authenticated;

-- ── Essai à soi-même ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.send_world_announcement_test(uuid, text, text, text, boolean, boolean);
CREATE OR REPLACE FUNCTION public.send_world_announcement_test(
  p_world_id     uuid,
  p_kind         text,
  p_title        text,
  p_body         text,
  p_as_world     boolean DEFAULT false,
  p_welcome      boolean DEFAULT false,
  p_wiki_page_id uuid DEFAULT NULL
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
  v_page       jsonb;
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

  -- La page liée d'un essai de bienvenue, comme à l'envoi réel.
  IF coalesce(p_welcome, false) AND p_wiki_page_id IS NOT NULL THEN
    v_page := public.welcome_wiki_page(p_world_id, p_wiki_page_id);
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
    || CASE WHEN coalesce(p_welcome, false) THEN jsonb_build_object('welcome', true) ELSE '{}'::jsonb END
    || CASE WHEN v_page IS NOT NULL THEN jsonb_build_object('wiki_page', v_page) ELSE '{}'::jsonb END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.send_world_announcement_test(uuid, text, text, text, boolean, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_world_announcement_test(uuid, text, text, text, boolean, boolean, uuid) TO authenticated;

-- Vérification :
-- SELECT has_function_privilege('anon', 'public.save_world_welcome(uuid,boolean,text,text,text,boolean,uuid)', 'EXECUTE');                -- → false
-- SELECT has_function_privilege('authenticated', 'public.welcome_wiki_page(uuid,uuid)', 'EXECUTE');                                      -- → false
-- SELECT has_function_privilege('authenticated', 'public.send_world_announcement_test(uuid,text,text,text,boolean,boolean,uuid)', 'EXECUTE'); -- → true
