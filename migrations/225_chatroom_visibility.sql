-- ─────────────────────────────────────────────────────────────
-- Migration 225 — Salons ouverts, publics ou privés ; synopsis
--
-- Un salon se crée désormais vide, avec un synopsis et une visibilité :
--   - `open`    (défaut, comportement historique) : tout membre du monde lit
--               et écrit ;
--   - `public`  : tout membre du monde lit ; seuls les invités écrivent ;
--   - `private` : seuls les invités lisent et écrivent. Le salon n'existe pas
--               pour les autres : ni liste, ni non-lus, ni notification, ni
--               avis temps réel, ni recherche.
--
-- Les invités (`chatroom_participants`) sont des personas ou des groupes de
-- personas (`world_persona_groups`) ; un groupe vaut pour tous ses membres,
-- présents et futurs. Un compte lit un salon privé s'il joue l'un de ces
-- personas (`owns_persona` : les PNJ suivent « Jouer les PNJ »).
--
-- Gardent toujours la main, quelle que soit la visibilité : le créateur du
-- salon et qui a `chatrooms.manage` (modération). Ils lisent un salon privé,
-- y écrivent avec n'importe lequel de leurs personas et gèrent les invités.
--
-- Trois fonctions portent la règle, et TOUT ce qui lit un salon passe par
-- elles :
--   can_read_private_chatroom(chat, uid) — invité, créateur ou modérateur ;
--   can_read_chatroom(chat, uid)         — membre du monde, et invité si privé ;
--   can_post_in_chatroom(chat, persona, uid).
--
-- Réécrits ici :
--   policies   chatrooms, chat_messages, chatroom_keys, chatroom_summaries,
--              chat_choice_votes, chat_pins, chat_message_reactions,
--              chatroom_persona_authors, chatroom_turns, chatroom_sequels,
--              challenge_attempts, message_reports, storage (chat-media,
--              chat-banners), realtime (room:, chat:) ;
--   RPC        list_chatrooms_nav, get_app_shell, get_all_chatroom_unreads,
--              get_chatroom_unreads, list_participated_chatrooms,
--              get_chatroom_stats, get_chatroom_persona_stats,
--              get_daily_challenge_journal ;
--   triggers   notify_on_new_chatroom, notify_on_chatroom_reply,
--              notify_on_persona_activity, notify_group_mentions,
--              tg_chatroom_sequel_notify,
--              broadcast_new_chat_message, broadcast_world_chatroom,
--              broadcast_world_summary, broadcast_room_patch.
-- Les fonctions SECURITY INVOKER (chronologie, recherche, salons à relier…)
-- passent par les policies et n'ont pas à changer.
--
-- Avis temps réel d'un salon privé :
--   - `world-msgs:<monde>` → remplacé par `msgs:<uid>` pour chaque lecteur
--     (même événement `message`, que le client traite déjà) ;
--   - `world:<monde>` `chatroom` → { op, id, private: true }, sans titre : le
--     client relit sa liste (list_chatrooms_nav, filtrée) ;
--   - `world:<monde>` `summary` → { op, chat_id, last_message_at, private:
--     true }, sans auteur ni avatar. Les non-lecteurs n'ont pas le salon dans
--     leur liste et l'ignorent.
-- ─────────────────────────────────────────────────────────────

-- ── Colonnes ─────────────────────────────────────────────────
ALTER TABLE public.chatrooms
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS synopsis   text;

ALTER TABLE public.chatrooms DROP CONSTRAINT IF EXISTS chatrooms_visibility_check;
ALTER TABLE public.chatrooms ADD CONSTRAINT chatrooms_visibility_check
  CHECK (visibility IN ('open', 'public', 'private'));
ALTER TABLE public.chatrooms DROP CONSTRAINT IF EXISTS chatrooms_synopsis_len;
ALTER TABLE public.chatrooms ADD CONSTRAINT chatrooms_synopsis_len
  CHECK (char_length(synopsis) <= 4000);

-- ── Invités ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chatroom_participants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chatroom_id uuid NOT NULL REFERENCES public.chatrooms(id) ON DELETE CASCADE,
  world_id    uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  persona_id  uuid REFERENCES public.personas(id) ON DELETE CASCADE,
  group_id    uuid REFERENCES public.world_persona_groups(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chatroom_participants_one_target CHECK (num_nonnulls(persona_id, group_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS chatroom_participants_persona_uniq
  ON public.chatroom_participants (chatroom_id, persona_id) WHERE persona_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chatroom_participants_group_uniq
  ON public.chatroom_participants (chatroom_id, group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chatroom_participants_persona_idx ON public.chatroom_participants (persona_id);
CREATE INDEX IF NOT EXISTS chatroom_participants_group_idx   ON public.chatroom_participants (group_id);
CREATE INDEX IF NOT EXISTS chatroom_participants_world_idx   ON public.chatroom_participants (world_id);

-- Le monde se déduit du salon ; un invité d'un autre monde est refusé.
CREATE OR REPLACE FUNCTION public.tg_chatroom_participants_world()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT c.world_id INTO NEW.world_id FROM public.chatrooms c WHERE c.id = NEW.chatroom_id;
  IF NEW.world_id IS NULL THEN
    RAISE EXCEPTION 'Salon introuvable.' USING ERRCODE = '23503';
  END IF;
  IF NEW.persona_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.personas p
     WHERE p.id = NEW.persona_id AND p.world_id = NEW.world_id
       AND p.deleted_at IS NULL AND p.is_template IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Ce persona n''appartient pas au monde du salon.' USING ERRCODE = '23514';
  END IF;
  IF NEW.group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.world_persona_groups g WHERE g.id = NEW.group_id AND g.world_id = NEW.world_id
  ) THEN
    RAISE EXCEPTION 'Ce groupe n''appartient pas au monde du salon.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tg_chatroom_participants_world() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chatroom_participants_world ON public.chatroom_participants;
CREATE TRIGGER trg_chatroom_participants_world
  BEFORE INSERT OR UPDATE ON public.chatroom_participants
  FOR EACH ROW EXECUTE FUNCTION public.tg_chatroom_participants_world();

-- ── Règles ───────────────────────────────────────────────────
-- Invité (persona ou groupe), créateur ou modérateur. Ne regarde ni la
-- visibilité ni l'appartenance au monde : `can_read_chatroom` s'en charge.
CREATE OR REPLACE FUNCTION public.can_read_private_chatroom(p_chat uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.chatrooms c
     WHERE c.id = p_chat
       AND (
         c.created_by = p_uid
         OR public.has_world_permission(c.world_id, p_uid, 'chatrooms.manage')
         OR EXISTS (
           SELECT 1
             FROM public.chatroom_participants cp
             JOIN public.personas p ON p.id = cp.persona_id
            WHERE cp.chatroom_id = c.id
              AND p.deleted_at IS NULL
              AND public.owns_persona(p.id, p_uid)
         )
         OR EXISTS (
           SELECT 1
             FROM public.chatroom_participants cp
             JOIN public.persona_group_assignments a ON a.group_id = cp.group_id
             JOIN public.personas p ON p.id = a.persona_id
            WHERE cp.chatroom_id = c.id
              AND p.deleted_at IS NULL
              AND public.owns_persona(p.id, p_uid)
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_chatroom(p_chat uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chatrooms c
     WHERE c.id = p_chat
       AND public.is_world_member(c.world_id, p_uid)
       AND (c.visibility <> 'private' OR public.can_read_private_chatroom(c.id, p_uid))
  );
$$;

-- Ne vérifie pas que `p_uid` joue `p_persona` : la policy d'insertion des
-- messages le fait déjà (owns_persona).
CREATE OR REPLACE FUNCTION public.can_post_in_chatroom(p_chat uuid, p_persona uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chatrooms c
     WHERE c.id = p_chat
       AND (
         c.visibility = 'open'
         OR c.created_by = p_uid
         OR public.has_world_permission(c.world_id, p_uid, 'chatrooms.manage')
         OR EXISTS (
           SELECT 1 FROM public.chatroom_participants cp
            WHERE cp.chatroom_id = c.id AND cp.persona_id = p_persona
         )
         OR EXISTS (
           SELECT 1
             FROM public.chatroom_participants cp
             JOIN public.persona_group_assignments a ON a.group_id = cp.group_id
            WHERE cp.chatroom_id = c.id AND a.persona_id = p_persona
         )
       )
  );
$$;

-- Qui gère les invités : comme la modification du salon (`chatrooms_update`).
CREATE OR REPLACE FUNCTION public.can_manage_chatroom_access(p_chat uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.chatrooms c
     WHERE c.id = p_chat
       AND (c.created_by = p_uid OR public.has_world_permission(c.world_id, p_uid, 'chatrooms.manage'))
  );
$$;

-- Pour le composeur : écrire librement (`open`), ou avec lesquels de mes
-- personas. NULL si le salon m'est invisible.
CREATE OR REPLACE FUNCTION public.get_chatroom_post_access(p_chat_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH moi AS (SELECT auth.uid() AS uid)
  SELECT CASE
    WHEN NOT public.can_read_chatroom(c.id, (SELECT uid FROM moi)) THEN NULL
    WHEN c.visibility = 'open'
      OR c.created_by = (SELECT uid FROM moi)
      OR public.has_world_permission(c.world_id, (SELECT uid FROM moi), 'chatrooms.manage')
      THEN jsonb_build_object('open', true, 'persona_ids', '[]'::jsonb)
    ELSE jsonb_build_object('open', false, 'persona_ids', COALESCE((
      SELECT jsonb_agg(p.id)
        FROM public.personas p
       WHERE p.world_id = c.world_id
         AND p.deleted_at IS NULL
         AND p.is_template IS NOT TRUE
         AND public.owns_persona(p.id, (SELECT uid FROM moi))
         AND public.can_post_in_chatroom(c.id, p.id, (SELECT uid FROM moi))
    ), '[]'::jsonb))
  END
  FROM public.chatrooms c
  WHERE c.id = p_chat_id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_chatroom_post_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chatroom_post_access(uuid) TO authenticated;

-- ── Policies des invités ─────────────────────────────────────
ALTER TABLE public.chatroom_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chatroom_participants_select ON public.chatroom_participants;
CREATE POLICY chatroom_participants_select ON public.chatroom_participants
  FOR SELECT TO authenticated
  USING (public.can_read_chatroom(chatroom_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS chatroom_participants_insert ON public.chatroom_participants;
CREATE POLICY chatroom_participants_insert ON public.chatroom_participants
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_chatroom_access(chatroom_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS chatroom_participants_delete ON public.chatroom_participants;
CREATE POLICY chatroom_participants_delete ON public.chatroom_participants
  FOR DELETE TO authenticated
  USING (public.can_manage_chatroom_access(chatroom_id, (SELECT auth.uid())));

REVOKE ALL ON public.chatroom_participants FROM anon;
GRANT SELECT, INSERT, DELETE ON public.chatroom_participants TO authenticated;

-- ── Policies réécrites ───────────────────────────────────────
DROP POLICY IF EXISTS "chatrooms select if world member" ON public.chatrooms;
CREATE POLICY "chatrooms select if world member" ON public.chatrooms
  FOR SELECT TO authenticated
  USING (
    public.is_world_member(world_id, (SELECT auth.uid()))
    AND (
      visibility <> 'private'
      -- En clair, avant la fonction : à l'insertion, `RETURNING` relit la
      -- ligne neuve, que la fonction (STABLE, instantané du début de la
      -- requête) ne voit pas encore. Le créateur serait refusé.
      OR created_by = (SELECT auth.uid())
      OR public.can_read_private_chatroom(id, (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "messages select if world member" ON public.chat_messages;
CREATE POLICY "messages select if world member" ON public.chat_messages
  FOR SELECT
  USING (
    public.can_read_chatroom(chat_id, (SELECT auth.uid()))
    AND (visible_to IS NULL OR (SELECT auth.uid()) = ANY (visible_to))
  );

DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chatrooms c
       WHERE c.id = chat_messages.chat_id
         AND public.has_world_permission(c.world_id, (SELECT auth.uid()), 'messages.post')
    )
    AND public.owns_persona(persona_id, (SELECT auth.uid()))
    AND public.is_persona_usable(persona_id, (SELECT auth.uid()))
    AND public.can_post_in_chatroom(chat_id, persona_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS chatroom_keys_select ON public.chatroom_keys;
CREATE POLICY chatroom_keys_select ON public.chatroom_keys
  FOR SELECT TO authenticated
  USING (public.can_read_chatroom(chatroom_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS chatroom_keys_insert ON public.chatroom_keys;
CREATE POLICY chatroom_keys_insert ON public.chatroom_keys
  FOR INSERT TO authenticated
  WITH CHECK (public.can_read_chatroom(chatroom_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "summaries select if world member" ON public.chatroom_summaries;
CREATE POLICY "summaries select if world member" ON public.chatroom_summaries
  FOR SELECT TO authenticated
  USING (public.can_read_chatroom(chat_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "choice_votes: members read" ON public.chat_choice_votes;
CREATE POLICY "choice_votes: members read" ON public.chat_choice_votes
  FOR SELECT TO authenticated
  USING (public.can_read_chatroom(chat_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "choice_votes: insert own (member, not author)" ON public.chat_choice_votes;
CREATE POLICY "choice_votes: insert own (member, not author)" ON public.chat_choice_votes
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_read_chatroom(chat_id, (SELECT auth.uid()))
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_messages m
       WHERE m.id = chat_choice_votes.message_id AND m.author_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "choice_votes: update own (member, not author)" ON public.chat_choice_votes;
CREATE POLICY "choice_votes: update own (member, not author)" ON public.chat_choice_votes
  FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_read_chatroom(chat_id, (SELECT auth.uid()))
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_messages m
       WHERE m.id = chat_choice_votes.message_id AND m.author_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "chat_pins: membres peuvent lire" ON public.chat_pins;
CREATE POLICY "chat_pins: membres peuvent lire" ON public.chat_pins
  FOR SELECT
  USING (public.can_read_chatroom(chat_id, (SELECT auth.uid())));

-- Épingler exigeait seulement d'être l'épingleur : n'importe quel compte
-- pouvait épingler dans n'importe quel salon. Il faut désormais le lire.
DROP POLICY IF EXISTS "chat_pins: authentifiés peuvent épingler" ON public.chat_pins;
CREATE POLICY "chat_pins: authentifiés peuvent épingler" ON public.chat_pins
  FOR INSERT
  WITH CHECK (
    pinned_by = (SELECT auth.uid())
    AND public.can_read_chatroom(chat_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "reactions: read if world member" ON public.chat_message_reactions;
CREATE POLICY "reactions: read if world member" ON public.chat_message_reactions
  FOR SELECT
  USING (public.can_read_chatroom(chat_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "reactions: insert own (member)" ON public.chat_message_reactions;
CREATE POLICY "reactions: insert own (member)" ON public.chat_message_reactions
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.can_read_chatroom(chat_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS chatroom_persona_authors_select ON public.chatroom_persona_authors;
CREATE POLICY chatroom_persona_authors_select ON public.chatroom_persona_authors
  FOR SELECT TO authenticated
  USING (public.can_read_chatroom(chat_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS chatroom_turns_select ON public.chatroom_turns;
CREATE POLICY chatroom_turns_select ON public.chatroom_turns
  FOR SELECT TO authenticated
  USING (public.can_read_chatroom(chat_id, (SELECT auth.uid())));

-- Un lien de suite ne se voit que si l'on lit ses deux salons.
DROP POLICY IF EXISTS chatroom_sequels_select ON public.chatroom_sequels;
CREATE POLICY chatroom_sequels_select ON public.chatroom_sequels
  FOR SELECT TO authenticated
  USING (
    public.can_read_chatroom(chatroom_id, (SELECT auth.uid()))
    AND public.can_read_chatroom(previous_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "challenge_attempts: read won in own worlds" ON public.challenge_attempts;
CREATE POLICY "challenge_attempts: read won in own worlds" ON public.challenge_attempts
  FOR SELECT
  USING (
    status = 'won'
    AND chat_id IS NOT NULL
    AND public.can_read_chatroom(chat_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS message_reports_insert ON public.message_reports;
CREATE POLICY message_reports_insert ON public.message_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND public.is_world_member(world_id, (SELECT auth.uid()))
    AND (chat_id IS NULL OR public.can_read_chatroom(chat_id, (SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "chat-media: members upload" ON storage.objects;
CREATE POLICY "chat-media: members upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND public.can_read_chatroom(substring(name, '^([0-9a-fA-F-]{36})/')::uuid, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "chat-banners: members write" ON storage.objects;
CREATE POLICY "chat-banners: members write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-banners'
    AND name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
    AND public.can_read_chatroom(substring(name, '^([0-9a-fA-F-]{36})/')::uuid, (SELECT auth.uid()))
  );

-- ── Canaux temps réel ────────────────────────────────────────
-- Reprend la policy de la migration 214 ; seul le canal `room:` change.
DROP POLICY IF EXISTS "wvlds_message_topics_read" ON realtime.messages;
CREATE POLICY "wvlds_message_topics_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND (
      (
        (SELECT realtime.topic()) ~ '^world-msgs:[0-9a-f-]{36}$'
        AND public.is_world_member(substr((SELECT realtime.topic()), 12)::uuid, (SELECT auth.uid()))
      )
      OR (SELECT realtime.topic()) = 'msgs:' || (SELECT auth.uid())::text
      OR (
        (SELECT realtime.topic()) ~ '^room:[0-9a-f-]{36}$'
        AND public.can_read_chatroom(substr((SELECT realtime.topic()), 6)::uuid, (SELECT auth.uid()))
      )
      OR (
        (SELECT realtime.topic()) ~ '^world:[0-9a-f-]{36}$'
        AND public.is_world_member(substr((SELECT realtime.topic()), 7)::uuid, (SELECT auth.uid()))
      )
      OR (
        (SELECT realtime.topic()) ~ '^wiki:[0-9a-f-]{36}$'
        AND EXISTS (
          SELECT 1 FROM public.world_wiki_pages p
           WHERE p.id = substr((SELECT realtime.topic()), 6)::uuid
        )
      )
    )
  );

DROP POLICY IF EXISTS "wvlds_chat_presence_read" ON realtime.messages;
CREATE POLICY "wvlds_chat_presence_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = ANY (ARRAY['broadcast', 'presence'])
    AND (SELECT realtime.topic()) ~ '^chat:[0-9a-f-]{36}$'
    AND public.can_read_chatroom(substr((SELECT realtime.topic()), 6)::uuid, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "wvlds_chat_presence_write" ON realtime.messages;
CREATE POLICY "wvlds_chat_presence_write"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.messages.extension = ANY (ARRAY['broadcast', 'presence'])
    AND (SELECT realtime.topic()) ~ '^chat:[0-9a-f-]{36}$'
    AND public.can_read_chatroom(substr((SELECT realtime.topic()), 6)::uuid, (SELECT auth.uid()))
  );

-- ── Listes et non-lus ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_chatrooms_nav(p_world_id uuid)
RETURNS TABLE(id uuid, title text, name text, icon_url text, last_message_at timestamp with time zone, last_message_excerpt text, unread_count integer, category_id uuid, last_poster_avatar_url text, last_poster_id uuid, participant_count integer, second_poster_avatar_url text, timeline_date jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH moi AS (SELECT auth.uid() AS uid),
  salons AS (
    SELECT r.*
    FROM public.chatrooms r
    WHERE r.world_id = p_world_id
      AND (
        EXISTS (SELECT 1 FROM public.world_members wm WHERE wm.world_id = p_world_id AND wm.user_id = (SELECT uid FROM moi))
        OR EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = p_world_id AND w.owner_id = (SELECT uid FROM moi))
      )
      AND (r.visibility <> 'private' OR public.can_read_private_chatroom(r.id, (SELECT uid FROM moi)))
  ),
  -- Un passage sur les messages des salons du monde : non-lus (migration 221 :
  -- place dans le fil OU date réelle d'envoi après la lecture) et auteurs
  -- distincts, hors soi-même.
  stats AS (
    SELECT m.chat_id,
      COUNT(*) FILTER (
        WHERE m.author_id <> (SELECT uid FROM moi)
          AND (m.created_at > COALESCE(cr.last_read_at, '-infinity'::timestamptz)
               OR (m.inserted_at IS NOT NULL
                   AND m.inserted_at > COALESCE(cr.last_read_at, '-infinity'::timestamptz)))
      )::int AS unread_count,
      COUNT(DISTINCT m.author_id) FILTER (
        WHERE (SELECT uid FROM moi) IS NULL OR m.author_id <> (SELECT uid FROM moi)
      )::int AS participant_count
    FROM public.chat_messages m
    JOIN salons r ON r.id = m.chat_id
    LEFT JOIN public.chatroom_reads cr
      ON cr.chat_id = m.chat_id AND cr.user_id = (SELECT uid FROM moi)
    GROUP BY m.chat_id
  )
  SELECT
    r.id,
    r.title,
    r.name,
    r.icon_url,
    s.last_message_at,
    s.last_message_excerpt,
    COALESCE(st.unread_count, 0) AS unread_count,
    r.category_id,
    COALESCE(s.last_message_persona_avatar_url, p.avatar_url) AS last_poster_avatar_url,
    s.last_message_author_id                                   AS last_poster_id,
    COALESCE(st.participant_count, 0)                          AS participant_count,
    -- Avant-dernier posteur : le plus récent message d'un autre auteur. Lu
    -- par l'index (chat_id, created_at) à rebours, arrêté au premier trouvé.
    (SELECT COALESCE(pn.avatar_url, p2.avatar_url)
     FROM public.chat_messages cm2
     LEFT JOIN public.profiles p2 ON p2.id = cm2.author_id
     LEFT JOIN public.personas pn ON pn.id = cm2.persona_id
     WHERE cm2.chat_id = r.id
       AND ((SELECT uid FROM moi) IS NULL OR cm2.author_id <> (SELECT uid FROM moi))
       AND (s.last_message_author_id IS NULL OR cm2.author_id <> s.last_message_author_id)
     ORDER BY cm2.created_at DESC
     LIMIT 1
    ) AS second_poster_avatar_url,
    r.timeline_date
  FROM salons r
  LEFT JOIN public.chatroom_summaries s ON s.chat_id = r.id
  LEFT JOIN public.profiles p ON p.id = s.last_message_author_id
  LEFT JOIN stats st ON st.chat_id = r.id
  ORDER BY COALESCE(s.last_message_at, r.updated_at) DESC, r.created_at DESC, r.id;
$$;

CREATE OR REPLACE FUNCTION public.get_all_chatroom_unreads()
RETURNS TABLE(chat_id uuid, world_id uuid, unread_messages integer, never_opened boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH u AS (SELECT auth.uid() AS id)
  SELECT
    r.id       AS chat_id,
    r.world_id AS world_id,
    COUNT(m.id)::int AS unread_messages,
    COALESCE(cr.chat_id IS NULL AND r.created_by <> (SELECT id FROM u), false) AS never_opened
  FROM public.chatrooms r
  JOIN public.world_members wm
    ON wm.world_id = r.world_id AND wm.user_id = (SELECT id FROM u)
  LEFT JOIN public.chatroom_reads cr
    ON cr.chat_id = r.id AND cr.user_id = (SELECT id FROM u)
  LEFT JOIN public.chat_messages m
    ON m.chat_id = r.id
   AND m.author_id <> (SELECT id FROM u)
   AND (cr.last_read_at IS NULL
        OR m.created_at > cr.last_read_at
        OR (m.inserted_at IS NOT NULL AND m.inserted_at > cr.last_read_at))
  WHERE r.visibility <> 'private' OR public.can_read_private_chatroom(r.id, (SELECT id FROM u))
  GROUP BY r.id, r.world_id, cr.chat_id
  HAVING COUNT(m.id) > 0
      OR COALESCE(cr.chat_id IS NULL AND r.created_by <> (SELECT id FROM u), false);
$$;

-- Plus appelée par le client, mais exposée : elle ne vérifiait même pas que
-- l'appelant est membre du monde.
CREATE OR REPLACE FUNCTION public.get_chatroom_unreads(wid uuid)
RETURNS TABLE(chat_id uuid, unread_messages integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH u AS (SELECT auth.uid() AS id)
  SELECT r.id AS chat_id,
         COUNT(m.*)::int AS unread_messages
  FROM public.chatrooms r
  LEFT JOIN public.chat_messages m
    ON m.chat_id = r.id
  LEFT JOIN public.chatroom_reads cr
    ON cr.chat_id = r.id AND cr.user_id = (SELECT id FROM u)
  WHERE r.world_id = wid
    AND public.can_read_chatroom(r.id, (SELECT id FROM u))
    AND (m.id IS NULL OR (m.author_id <> (SELECT id FROM u)
         AND (cr.last_read_at IS NULL
              OR m.created_at > cr.last_read_at
              OR (m.inserted_at IS NOT NULL AND m.inserted_at > cr.last_read_at))))
  GROUP BY r.id;
$$;

CREATE OR REPLACE FUNCTION public.list_participated_chatrooms(p_world_id uuid, p_limit integer DEFAULT 3)
RETURNS TABLE(id uuid, title text, name text, icon_url text, last_message_at timestamp with time zone, has_unread boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id,
    c.title,
    c.name,
    c.icon_url,
    last_msg.ts                                        AS last_message_at,
    CASE
      WHEN cr.last_read_at IS NULL THEN (last_msg.ts IS NOT NULL)
      ELSE GREATEST(last_msg.ts, last_ins.ts) > cr.last_read_at
    END                                                AS has_unread
  FROM chatrooms c
  LEFT JOIN LATERAL (
    SELECT MAX(cm.created_at) AS ts
    FROM chat_messages cm
    WHERE cm.chat_id = c.id
  ) last_msg ON true
  LEFT JOIN LATERAL (
    SELECT MAX(cm.inserted_at) AS ts
    FROM chat_messages cm
    WHERE cm.chat_id = c.id AND cm.inserted_at IS NOT NULL
  ) last_ins ON true
  LEFT JOIN chatroom_reads cr
    ON cr.chat_id = c.id AND cr.user_id = auth.uid()
  WHERE c.world_id = p_world_id
    AND EXISTS (
      SELECT 1
      FROM chat_messages cm2
      WHERE cm2.chat_id = c.id
        AND cm2.author_id = auth.uid()
    )
    AND public.can_read_chatroom(c.id, auth.uid())
  ORDER BY last_msg.ts DESC NULLS LAST
  LIMIT p_limit
$$;

-- Seul le bloc `room_unreads` change.
CREATE OR REPLACE FUNCTION public.get_app_shell(p_notif_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH u AS (SELECT auth.uid() AS id),

  world_ids AS (
    SELECT wm.world_id
    FROM public.world_members wm
    WHERE wm.user_id = (SELECT id FROM u)
  ),

  room_unreads AS (
    SELECT
      r.id       AS chat_id,
      r.world_id AS world_id,
      COUNT(m.id)::int AS unread_messages,
      COALESCE(cr.chat_id IS NULL AND r.created_by <> (SELECT id FROM u), false) AS never_opened
    FROM public.chatrooms r
    JOIN public.world_members wm
      ON wm.world_id = r.world_id AND wm.user_id = (SELECT id FROM u)
    LEFT JOIN public.chatroom_reads cr
      ON cr.chat_id = r.id AND cr.user_id = (SELECT id FROM u)
    LEFT JOIN public.chat_messages m
      ON m.chat_id = r.id
     AND m.author_id <> (SELECT id FROM u)
     AND (cr.last_read_at IS NULL
          OR m.created_at > cr.last_read_at
          OR (m.inserted_at IS NOT NULL AND m.inserted_at > cr.last_read_at))
    WHERE r.visibility <> 'private' OR public.can_read_private_chatroom(r.id, (SELECT id FROM u))
    GROUP BY r.id, r.world_id, cr.chat_id
    HAVING COUNT(m.id) > 0
        OR COALESCE(cr.chat_id IS NULL AND r.created_by <> (SELECT id FROM u), false)
  ),

  notif_prefs AS (
    SELECT np.type, np.enabled
    FROM public.notification_preferences np
    WHERE np.user_id = (SELECT id FROM u)
  ),

  notifs AS (
    SELECT n.*, w.name AS world_name, w.icon_url AS world_icon_url
    FROM public.notifications n
    LEFT JOIN public.worlds w ON w.id = n.world_id
    WHERE n.recipient_id = (SELECT id FROM u) AND n.archived_at IS NULL
    ORDER BY n.updated_at DESC
    LIMIT p_notif_limit
  ),

  dms AS (
    SELECT
      c.id,
      CASE WHEN c.participant_a = (SELECT id FROM u) THEN c.participant_b ELSE c.participant_a END AS other_user_id,
      p.username   AS other_username,
      p.avatar_url AS other_avatar_url,
      c.last_message_at,
      c.created_at,
      (
        SELECT msg.content FROM public.dm_messages msg
        WHERE msg.conversation_id = c.id
        ORDER BY msg.created_at DESC LIMIT 1
      ) AS last_message_content,
      (
        SELECT msg.author_id FROM public.dm_messages msg
        WHERE msg.conversation_id = c.id
        ORDER BY msg.created_at DESC LIMIT 1
      ) AS last_message_author_id,
      (
        SELECT COUNT(*) FROM public.dm_messages msg
        WHERE msg.conversation_id = c.id
          AND msg.author_id != (SELECT id FROM u)
          AND msg.created_at > COALESCE(
            (SELECT r.last_read_at FROM public.dm_reads r
             WHERE r.conversation_id = c.id AND r.user_id = (SELECT id FROM u)),
            '1970-01-01'::timestamptz
          )
      ) AS unread_count
    FROM public.dm_conversations c
    JOIN public.profiles p ON p.id = CASE
      WHEN c.participant_a = (SELECT id FROM u) THEN c.participant_b
      ELSE c.participant_a
    END
    WHERE c.participant_a = (SELECT id FROM u)
       OR c.participant_b = (SELECT id FROM u)
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    LIMIT 20
  )

  SELECT jsonb_build_object(
    'world_ids', (SELECT COALESCE(jsonb_agg(world_id), '[]'::jsonb) FROM world_ids),
    'world_unreads', '[]'::jsonb,
    'room_unreads', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'chat_id', chat_id, 'world_id', world_id,
        'unread_messages', unread_messages, 'never_opened', never_opened
      )), '[]'::jsonb) FROM room_unreads
    ),
    'notification_preferences', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'type', type, 'enabled', enabled
      )), '[]'::jsonb) FROM notif_prefs
    ),
    'notifications', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'recipient_id', recipient_id, 'type', type, 'world_id', world_id,
        'chat_id', chat_id, 'message_id', message_id, 'actor_id', actor_id,
        'actor_name', actor_name, 'persona_id', persona_id, 'content', content, 'metadata', metadata,
        'read_at', read_at, 'archived_at', archived_at, 'created_at', created_at,
        'updated_at', updated_at,
        'world', CASE WHEN world_id IS NULL THEN NULL
                      ELSE jsonb_build_object('name', world_name, 'icon_url', world_icon_url) END
      )), '[]'::jsonb) FROM notifs
    ),
    'dm_conversations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'other_user_id', other_user_id, 'other_username', other_username,
        'other_avatar_url', other_avatar_url, 'last_message_at', last_message_at,
        'created_at', created_at, 'last_message_content', last_message_content,
        'last_message_author_id', last_message_author_id, 'unread_count', unread_count
      )), '[]'::jsonb) FROM dms
    )
  );
$$;

-- ── Statistiques d'un salon ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_chatroom_stats(p_chat_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH room AS (
  SELECT r.id
  FROM public.chatrooms r
  WHERE r.id = p_chat_id
    AND (
      EXISTS (
        SELECT 1 FROM public.world_members wm
        WHERE wm.world_id = r.world_id AND wm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.worlds w
        WHERE w.id = r.world_id AND w.owner_id = auth.uid()
      )
    )
    AND (r.visibility <> 'private' OR public.can_read_private_chatroom(r.id, auth.uid()))
),
msgs AS (
  SELECT
    m.author_id,
    m.created_at,
    COALESCE((m.metadata->>'word_count')::int, 0) AS words,
    EXTRACT(EPOCH FROM m.created_at - lag(m.created_at) OVER (ORDER BY m.created_at)) AS gap
  FROM public.chat_messages m
  JOIN room ON m.chat_id = room.id
),
per_user AS (
  SELECT
    m.author_id,
    p.username,
    p.avatar_url,
    count(*)::int AS message_count,
    COALESCE(sum(m.words), 0)::int AS word_count,
    round(COALESCE(avg(m.words), 0)::numeric, 1) AS avg_words,
    min(m.created_at) AS first_message_at,
    max(m.created_at) AS last_message_at
  FROM msgs m
  LEFT JOIN public.profiles p ON p.id = m.author_id
  GROUP BY m.author_id, p.username, p.avatar_url
)
SELECT jsonb_build_object(
  'chat_id', (SELECT id FROM room),
  'message_count', (SELECT count(*)::int FROM msgs),
  'participant_count', (SELECT count(DISTINCT author_id)::int FROM msgs),
  'min_gap_seconds', (SELECT min(gap) FROM msgs WHERE gap IS NOT NULL),
  'max_gap_seconds', (SELECT max(gap) FROM msgs WHERE gap IS NOT NULL),
  'needs_recompute', false,
  'updated_at', now(),
  'users', COALESCE(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'profile_id', author_id,
         'username', username,
         'avatar_url', avatar_url,
         'message_count', message_count,
         'word_count', word_count,
         'avg_words_per_message', avg_words,
         'first_message_at', first_message_at,
         'last_message_at', last_message_at
       ) ORDER BY message_count DESC
     ) FROM per_user),
    '[]'::jsonb
  )
)
WHERE EXISTS (SELECT 1 FROM room);
$$;

CREATE OR REPLACE FUNCTION public.get_chatroom_persona_stats(p_chat_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH room AS (
  SELECT r.id
  FROM public.chatrooms r
  WHERE r.id = p_chat_id
    AND (
      EXISTS (
        SELECT 1 FROM public.world_members wm
        WHERE wm.world_id = r.world_id AND wm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.worlds w
        WHERE w.id = r.world_id AND w.owner_id = auth.uid()
      )
    )
    AND (r.visibility <> 'private' OR public.can_read_private_chatroom(r.id, auth.uid()))
),
msgs AS (
  SELECT
    m.persona_id,
    m.created_at,
    COALESCE((m.metadata->>'word_count')::int, 0) AS words
  FROM public.chat_messages m
  JOIN room ON m.chat_id = room.id
  WHERE m.persona_id IS NOT NULL
),
per_persona AS (
  SELECT
    m.persona_id,
    pe.name,
    pe.avatar_url,
    pr.username,
    count(*)::int AS message_count,
    COALESCE(sum(m.words), 0)::int AS word_count,
    round(COALESCE(avg(m.words), 0)::numeric, 1) AS avg_words,
    min(m.created_at) AS first_message_at,
    max(m.created_at) AS last_message_at
  FROM msgs m
  LEFT JOIN public.personas pe ON pe.id = m.persona_id
  LEFT JOIN public.profiles pr ON pr.id = pe.user_id
  GROUP BY m.persona_id, pe.name, pe.avatar_url, pr.username
)
SELECT COALESCE(
  (SELECT jsonb_agg(
     jsonb_build_object(
       'persona_id', persona_id,
       'name', name,
       'avatar_url', avatar_url,
       'username', username,
       'message_count', message_count,
       'word_count', word_count,
       'avg_words_per_message', avg_words,
       'first_message_at', first_message_at,
       'last_message_at', last_message_at
     ) ORDER BY message_count DESC
   ) FROM per_persona),
  '[]'::jsonb
)
WHERE EXISTS (SELECT 1 FROM room);
$$;

-- Le journal du défi du jour ne nomme plus un salon privé qu'on ne lit pas.
CREATE OR REPLACE FUNCTION public.get_daily_challenge_journal(p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(challenge_id uuid, challenge_title text, user_id uuid, username text, avatar_url text, chat_id uuid, chatroom_title text, won_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT
    c.id                AS challenge_id,
    c.title             AS challenge_title,
    p.id                AS user_id,
    p.username          AS username,
    p.avatar_url        AS avatar_url,
    ch.id               AS chat_id,
    ch.title            AS chatroom_title,
    ca.created_at       AS won_at
  FROM public.challenge_attempts ca
  JOIN public.challenges   c  ON c.id  = ca.challenge_id
  JOIN public.profiles     p  ON p.id  = ca.user_id
  LEFT JOIN public.chatrooms ch
    ON ch.id = ca.chat_id
   AND (ch.visibility <> 'private' OR public.can_read_private_chatroom(ch.id, auth.uid()))
  WHERE c.active_date = p_date
    AND ca.status = 'won'
  ORDER BY ca.created_at DESC;
$$;

-- ── Notifications ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_chatroom_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_participant    RECORD;
  v_world_id       UUID;
  v_actor_name     TEXT;
  v_chatroom_name  TEXT;
  v_private        BOOLEAN;
  v_enabled        BOOLEAN;
  v_persona_name   TEXT;
  v_persona_avatar TEXT;
  v_persona_meta   JSONB;
BEGIN
  IF NEW.author_id IS NULL THEN RETURN NEW; END IF;

  SELECT world_id, COALESCE(title, name), visibility = 'private'
  INTO v_world_id, v_chatroom_name, v_private
  FROM public.chatrooms WHERE id = NEW.chat_id;

  IF v_world_id IS NULL THEN RETURN NEW; END IF;

  SELECT username INTO v_actor_name FROM public.profiles WHERE id = NEW.author_id;

  IF NEW.persona_id IS NOT NULL THEN
    SELECT name, avatar_url INTO v_persona_name, v_persona_avatar
    FROM public.personas WHERE id = NEW.persona_id;
    v_persona_meta := jsonb_build_object('persona_name', v_persona_name, 'icon_url', v_persona_avatar);
  ELSE
    v_persona_meta := '{}'::jsonb;
  END IF;

  FOR v_participant IN
    SELECT d.user_id
      FROM (
        SELECT DISTINCT author_id AS user_id
        FROM public.chat_messages
        WHERE chat_id = NEW.chat_id
          AND author_id IS DISTINCT FROM NEW.author_id
          AND author_id IS NOT NULL
      ) d
     WHERE NOT v_private OR public.can_read_private_chatroom(NEW.chat_id, d.user_id)
     LIMIT 200
  LOOP
    SELECT enabled INTO v_enabled
    FROM public.notification_preferences
    WHERE user_id = v_participant.user_id AND type = 'chatroom_reply';
    IF v_enabled = false THEN CONTINUE; END IF;

    INSERT INTO public.notifications
      (recipient_id, type, world_id, chat_id, actor_id, actor_name, persona_id, content, metadata, updated_at)
    VALUES
      (v_participant.user_id, 'chatroom_reply', v_world_id, NEW.chat_id,
       NEW.author_id, v_actor_name, NEW.persona_id, v_chatroom_name,
       ('{"count": 1}'::jsonb || v_persona_meta), now())
    ON CONFLICT (recipient_id, chat_id)
    WHERE type = 'chatroom_reply' AND archived_at IS NULL AND read_at IS NULL
    DO UPDATE SET
      metadata   = (jsonb_set(
                     COALESCE(notifications.metadata, '{}'),
                     '{count}',
                     to_jsonb(COALESCE((notifications.metadata->>'count')::int, 0) + 1)
                   ) - 'persona_name' - 'icon_url') || v_persona_meta,
      actor_id   = NEW.author_id,
      actor_name = v_actor_name,
      persona_id = NEW.persona_id,
      updated_at = now();

  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_persona_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_follower       RECORD;
  v_chatroom_name  TEXT;
  v_private        BOOLEAN;
  v_persona_name   TEXT;
  v_persona_avatar TEXT;
  v_is_first       BOOLEAN;
  v_notif_type     TEXT;
  v_enabled        BOOLEAN;
BEGIN
  IF NEW.persona_id IS NULL OR NEW.world_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(title, name), visibility = 'private' INTO v_chatroom_name, v_private
  FROM public.chatrooms WHERE id = NEW.chat_id;

  SELECT name, avatar_url INTO v_persona_name, v_persona_avatar
  FROM public.personas WHERE id = NEW.persona_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.chat_messages
    WHERE chat_id = NEW.chat_id AND id <> NEW.id
  ) INTO v_is_first;

  v_notif_type := CASE WHEN v_is_first THEN 'persona_new_chatroom' ELSE 'persona_reply' END;

  FOR v_follower IN
    SELECT follower_id FROM public.persona_follows
    WHERE persona_id = NEW.persona_id
      AND follower_id IS DISTINCT FROM NEW.author_id
      AND (NOT v_private OR public.can_read_private_chatroom(NEW.chat_id, follower_id))
  LOOP
    SELECT enabled INTO v_enabled
    FROM public.notification_preferences
    WHERE user_id = v_follower.follower_id AND type = v_notif_type;
    IF v_enabled = false THEN CONTINUE; END IF;

    IF v_is_first THEN
      INSERT INTO public.notifications
        (recipient_id, type, world_id, chat_id, actor_id, actor_name, persona_id, content, metadata)
      VALUES
        (v_follower.follower_id, v_notif_type, NEW.world_id, NEW.chat_id,
         NEW.author_id, v_persona_name, NEW.persona_id, v_chatroom_name,
         jsonb_build_object('icon_url', v_persona_avatar));
    ELSE
      -- Si ce follower a déjà posté dans ce salon, notify_on_chatroom_reply
      -- lui enverra (ou a déjà envoyé) une notification chatroom_reply
      -- enrichie de l'identité du persona : pas la peine de dupliquer.
      IF EXISTS (
        SELECT 1 FROM public.chat_messages
        WHERE chat_id = NEW.chat_id
          AND author_id = v_follower.follower_id
          AND id <> NEW.id
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.notifications
        (recipient_id, type, world_id, chat_id, actor_id, actor_name, persona_id, content, metadata, updated_at)
      VALUES
        (v_follower.follower_id, v_notif_type, NEW.world_id, NEW.chat_id,
         NEW.author_id, v_persona_name, NEW.persona_id, v_chatroom_name,
         jsonb_build_object('icon_url', v_persona_avatar, 'count', 1), now())
      ON CONFLICT (recipient_id, persona_id, chat_id)
      WHERE type = 'persona_reply' AND archived_at IS NULL
      DO UPDATE SET
        metadata   = jsonb_set(
                       COALESCE(notifications.metadata, '{}'),
                       '{count}',
                       to_jsonb(COALESCE((notifications.metadata->>'count')::int, 0) + 1)
                     ) || jsonb_build_object('icon_url', v_persona_avatar),
        actor_id   = NEW.author_id,
        actor_name = v_persona_name,
        updated_at = now(),
        read_at    = NULL;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_group_mentions(p_message_id bigint, p_role_ids uuid[] DEFAULT '{}'::uuid[], p_everyone boolean DEFAULT false, p_here_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_chat_id  uuid;
  v_world_id uuid;
  v_author   uuid;
  v_title    text;
  v_private  boolean;
  v_actor    text;
  v_role     record;
  v_n        integer;
  v_total    integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.';
  END IF;

  SELECT m.chat_id, m.world_id, m.author_id INTO v_chat_id, v_world_id, v_author
    FROM public.chat_messages m WHERE m.id = p_message_id;
  IF v_author IS NULL OR v_author <> v_uid THEN
    RAISE EXCEPTION 'Ce message n''est pas le vôtre.';
  END IF;
  IF v_world_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT coalesce(c.title, c.name), c.visibility = 'private' INTO v_title, v_private
    FROM public.chatrooms c WHERE c.id = v_chat_id;
  SELECT p.username INTO v_actor FROM public.profiles p WHERE p.id = v_uid;

  FOR v_role IN
    SELECT r.id, r.name, r.color, r.mentionable
      FROM public.world_roles r
     WHERE r.world_id = v_world_id AND r.id = ANY (coalesce(p_role_ids, '{}'::uuid[]))
  LOOP
    IF NOT v_role.mentionable AND NOT public.has_world_permission(v_world_id, v_uid, 'mentions.roles') THEN
      CONTINUE;
    END IF;
    INSERT INTO public.notifications (recipient_id, type, world_id, chat_id, message_id, actor_id, actor_name, content, metadata)
    SELECT mr.user_id, 'role_mention', v_world_id, v_chat_id, p_message_id, v_uid, v_actor, v_title,
           jsonb_build_object('role_id', v_role.id, 'role_name', v_role.name, 'role_color', v_role.color)
      FROM public.world_member_roles mr
     WHERE mr.role_id = v_role.id AND mr.user_id <> v_uid
       AND (NOT v_private OR public.can_read_private_chatroom(v_chat_id, mr.user_id))
     LIMIT 500
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;

  IF (p_everyone OR coalesce(array_length(p_here_ids, 1), 0) > 0)
     AND public.has_world_permission(v_world_id, v_uid, 'mentions.everyone') THEN
    INSERT INTO public.notifications (recipient_id, type, world_id, chat_id, message_id, actor_id, actor_name, content, metadata)
    SELECT wm.user_id, 'everyone_mention', v_world_id, v_chat_id, p_message_id, v_uid, v_actor, v_title,
           jsonb_build_object('scope', CASE WHEN p_everyone THEN 'everyone' ELSE 'here' END)
      FROM public.world_members wm
     WHERE wm.world_id = v_world_id
       AND wm.user_id <> v_uid
       AND (p_everyone OR wm.user_id = ANY (p_here_ids))
       AND (NOT v_private OR public.can_read_private_chatroom(v_chat_id, wm.user_id))
     LIMIT 500
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END IF;

  RETURN v_total;
END;
$$;

-- La demande de suite ne part qu'à qui lit les deux salons.
CREATE OR REPLACE FUNCTION public.tg_chatroom_sequel_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  text;
  v_suite  text;
  v_prec   text;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  SELECT pr.username INTO v_actor FROM public.profiles pr WHERE pr.id = NEW.created_by;
  SELECT COALESCE(c.title, c.name) INTO v_suite FROM public.chatrooms c WHERE c.id = NEW.chatroom_id;
  SELECT COALESCE(c.title, c.name) INTO v_prec FROM public.chatrooms c WHERE c.id = NEW.previous_id;
  INSERT INTO public.notifications (recipient_id, type, world_id, actor_id, actor_name, content, metadata)
  SELECT p.uid, 'sequel_request', NEW.world_id, NEW.created_by, v_actor, left(v_suite, 200),
         jsonb_build_object('sequel_id', NEW.id, 'chatroom_title', left(v_suite, 200), 'previous_title', left(v_prec, 200))
    FROM (
      SELECT c.created_by AS uid FROM public.chatrooms c WHERE c.id = NEW.previous_id AND c.created_by IS NOT NULL
      UNION
      SELECT DISTINCT m.author_id FROM public.chat_messages m WHERE m.chat_id = NEW.previous_id AND m.author_id IS NOT NULL
    ) p
   WHERE p.uid IS DISTINCT FROM NEW.created_by
     AND public.can_read_chatroom(NEW.previous_id, p.uid)
     AND public.can_read_chatroom(NEW.chatroom_id, p.uid)
   LIMIT 500;
  RETURN NEW;
END;
$$;

-- ── Diffusions ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_new_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  avis jsonb;
  destinataire uuid;
  prive boolean;
BEGIN
  IF NEW.world_id IS NULL THEN
    RETURN NULL;
  END IF;

  avis := jsonb_build_object(
    'id', NEW.id,
    'chat_id', NEW.chat_id,
    'world_id', NEW.world_id,
    'author_id', NEW.author_id
  );

  IF NEW.visible_to IS NULL THEN
    SELECT c.visibility = 'private' INTO prive FROM public.chatrooms c WHERE c.id = NEW.chat_id;
    IF prive THEN
      -- Salon privé : l'avis va à chacun de ses lecteurs, pas au monde.
      FOR destinataire IN
        SELECT wm.user_id FROM public.world_members wm
         WHERE wm.world_id = NEW.world_id
           AND public.can_read_private_chatroom(NEW.chat_id, wm.user_id)
      LOOP
        PERFORM realtime.send(avis, 'message', 'msgs:' || destinataire::text, true);
      END LOOP;
    ELSE
      PERFORM realtime.send(avis, 'message', 'world-msgs:' || NEW.world_id::text, true);
    END IF;
  ELSE
    FOREACH destinataire IN ARRAY NEW.visible_to LOOP
      PERFORM realtime.send(avis, 'message', 'msgs:' || destinataire::text, true);
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Un avis temps réel ne doit jamais faire échouer l'envoi d'un message.
  RAISE WARNING 'broadcast_new_chat_message : %', SQLERRM;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.broadcast_new_chat_message() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.broadcast_world_chatroom()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.chatrooms%ROWTYPE;
  prive boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF TG_OP = 'UPDATE' AND
     (NEW.world_id, NEW.title, NEW.name, NEW.tag, NEW.banner_url, NEW.icon_url, NEW.category_id,
      NEW.timeline_date, NEW.map_pin_id, NEW.arc_id, NEW.status, NEW.visibility)
     IS NOT DISTINCT FROM
     (OLD.world_id, OLD.title, OLD.name, OLD.tag, OLD.banner_url, OLD.icon_url, OLD.category_id,
      OLD.timeline_date, OLD.map_pin_id, OLD.arc_id, OLD.status, OLD.visibility) THEN
    RETURN NULL;
  END IF;
  -- Privé avant ou après : ni titre ni icône sur le canal du monde ; le
  -- client relit sa liste, filtrée par list_chatrooms_nav.
  prive := r.visibility = 'private' OR (TG_OP = 'UPDATE' AND OLD.visibility = 'private');
  IF r.world_id IS NOT NULL THEN
    IF prive THEN
      PERFORM public.wvlds_notify('world:' || r.world_id::text, 'chatroom',
        jsonb_build_object('op', TG_OP, 'id', r.id, 'private', true));
    ELSE
      PERFORM public.wvlds_notify('world:' || r.world_id::text, 'chatroom',
        jsonb_build_object('op', TG_OP, 'id', r.id, 'title', r.title, 'name', r.name,
                           'icon_url', r.icon_url, 'category_id', r.category_id));
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.world_id IS DISTINCT FROM NEW.world_id AND OLD.world_id IS NOT NULL THEN
    PERFORM public.wvlds_notify('world:' || OLD.world_id::text, 'chatroom',
      jsonb_build_object('op', 'DELETE', 'id', OLD.id));
  END IF;
  RETURN NULL;
END;
$$;

-- Les invités changent qui voit un salon privé : on prévient le monde de
-- relire sa liste, comme pour un changement de visibilité. Ils changent aussi
-- qui écrit : le canal du salon reçoit un avis sans contenu, sur lequel
-- chaque lecteur relit son propre accès (`get_chatroom_post_access`).
CREATE OR REPLACE FUNCTION public.broadcast_chatroom_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.chatroom_participants%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.chatrooms c WHERE c.id = r.chatroom_id AND c.visibility = 'private') THEN
    PERFORM public.wvlds_notify('world:' || r.world_id::text, 'chatroom',
      jsonb_build_object('op', 'UPDATE', 'id', r.chatroom_id, 'private', true));
  END IF;
  BEGIN
    PERFORM realtime.send(jsonb_build_object('participants', true),
      'chatroom', 'room:' || r.chatroom_id::text, true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'broadcast_chatroom_participants : %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.broadcast_chatroom_participants() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_broadcast_chatroom_participants ON public.chatroom_participants;
CREATE TRIGGER trg_broadcast_chatroom_participants
  AFTER INSERT OR DELETE ON public.chatroom_participants
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_chatroom_participants();

CREATE OR REPLACE FUNCTION public.broadcast_world_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.chatroom_summaries%ROWTYPE;
  monde uuid;
  prive boolean;
  avatar text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  SELECT c.world_id, c.visibility = 'private' INTO monde, prive FROM public.chatrooms c WHERE c.id = r.chat_id;
  IF monde IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.wvlds_notify('world:' || monde::text, 'summary',
      jsonb_build_object('op', TG_OP, 'chat_id', r.chat_id));
  ELSIF prive THEN
    -- Ni auteur ni avatar : qui joue dans un salon privé ne regarde que lui.
    PERFORM public.wvlds_notify('world:' || monde::text, 'summary',
      jsonb_build_object('op', TG_OP, 'chat_id', r.chat_id,
                         'last_message_at', r.last_message_at, 'private', true));
  ELSE
    avatar := r.last_message_persona_avatar_url;
    IF avatar IS NULL AND r.last_message_author_id IS NOT NULL THEN
      SELECT p.avatar_url INTO avatar FROM public.profiles p WHERE p.id = r.last_message_author_id;
    END IF;
    PERFORM public.wvlds_notify('world:' || monde::text, 'summary',
      jsonb_build_object('op', TG_OP, 'chat_id', r.chat_id,
                         'last_message_at', r.last_message_at,
                         'last_message_author_id', r.last_message_author_id,
                         'last_message_persona_avatar_url', avatar));
  END IF;
  RETURN NULL;
END;
$$;

-- Le canal du salon (lecteurs seulement) porte aussi synopsis et visibilité.
CREATE OR REPLACE FUNCTION public.broadcast_room_patch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.title, NEW.name, NEW.banner_url, NEW.icon_url, NEW.synopsis, NEW.visibility)
     IS DISTINCT FROM (OLD.title, OLD.name, OLD.banner_url, OLD.icon_url, OLD.synopsis, OLD.visibility) THEN
    PERFORM realtime.send(
      jsonb_build_object('title', NEW.title, 'name', NEW.name, 'banner_url', NEW.banner_url,
                         'icon_url', NEW.icon_url, 'synopsis', NEW.synopsis, 'visibility', NEW.visibility),
      'chatroom', 'room:' || NEW.id::text, true);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_patch : %', SQLERRM;
  RETURN NULL;
END;
$$;

-- ── « Nouveau salon » ────────────────────────────────────────
-- À la création d'un salon privé, ses invités ne sont pas encore inscrits
-- (ils le sont juste après) : seuls les modérateurs sont prévenus ici, les
-- invités le sont à leur ajout.
CREATE OR REPLACE FUNCTION public.notify_on_new_chatroom()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_member     RECORD;
  v_actor_name TEXT;
  v_enabled    BOOLEAN;
BEGIN
  IF NEW.world_id IS NULL THEN RETURN NEW; END IF;

  SELECT username INTO v_actor_name FROM public.profiles WHERE id = NEW.created_by;

  FOR v_member IN
    SELECT user_id FROM public.world_members
    WHERE world_id = NEW.world_id
      AND user_id IS DISTINCT FROM NEW.created_by
      AND (NEW.visibility <> 'private' OR public.can_read_private_chatroom(NEW.id, user_id))
  LOOP
    SELECT enabled INTO v_enabled
    FROM public.notification_preferences
    WHERE user_id = v_member.user_id AND type = 'new_chatroom';

    IF v_enabled IS DISTINCT FROM false THEN
      INSERT INTO public.notifications
        (recipient_id, type, world_id, chat_id, actor_id, actor_name, content)
      VALUES
        (v_member.user_id, 'new_chatroom', NEW.world_id, NEW.id,
         NEW.created_by, v_actor_name, COALESCE(NEW.title, NEW.name));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Un invité ajouté à un salon privé reçoit la notification « nouveau
-- salon » qu'il n'a pas eue à la création — une seule fois par salon.
CREATE OR REPLACE FUNCTION public.notify_chatroom_invitees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  salon public.chatrooms%ROWTYPE;
  v_actor_name text;
BEGIN
  SELECT * INTO salon FROM public.chatrooms c WHERE c.id = NEW.chatroom_id;
  IF NOT FOUND OR salon.visibility <> 'private' THEN RETURN NULL; END IF;

  SELECT username INTO v_actor_name FROM public.profiles WHERE id = salon.created_by;

  INSERT INTO public.notifications (recipient_id, type, world_id, chat_id, actor_id, actor_name, content)
  SELECT DISTINCT p.user_id, 'new_chatroom', salon.world_id, salon.id,
         salon.created_by, v_actor_name, COALESCE(salon.title, salon.name)
    FROM public.personas p
   WHERE p.deleted_at IS NULL
     AND p.user_id IS NOT NULL
     AND p.user_id IS DISTINCT FROM salon.created_by
     AND (
       p.id = NEW.persona_id
       OR EXISTS (SELECT 1 FROM public.persona_group_assignments a WHERE a.group_id = NEW.group_id AND a.persona_id = p.id)
     )
     AND public.is_world_member(salon.world_id, p.user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.notification_preferences np
        WHERE np.user_id = p.user_id AND np.type = 'new_chatroom' AND np.enabled = false
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications n
        WHERE n.recipient_id = p.user_id AND n.chat_id = salon.id AND n.type = 'new_chatroom'
     );
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_chatroom_invitees() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_chatroom_invitees ON public.chatroom_participants;
CREATE TRIGGER trg_notify_chatroom_invitees
  AFTER INSERT ON public.chatroom_participants
  FOR EACH ROW EXECUTE FUNCTION public.notify_chatroom_invitees();

-- ── RETOUR ARRIÈRE ───────────────────────────────────────────
-- Repasser tous les salons en `open` (UPDATE chatrooms SET visibility = 'open')
-- rend le comportement historique sans toucher aux policies : chaque règle
-- réécrite ici se réduit à l'ancienne pour un salon ouvert. Supprimer ensuite
-- la table et les colonnes exige de rejouer les définitions des migrations
-- 206, 212, 214, 221, 222 et 194.
