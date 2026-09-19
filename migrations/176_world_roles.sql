-- ============================================================
-- Migration 176 — Rôles personnalisés et permissions par monde
-- ============================================================
-- Jusqu'ici, les droits d'un membre tenaient à l'enum `world_role`
-- (owner/admin/editor/player/viewer) porté par `world_members.role`. Cette
-- migration le remplace par des rôles définis PAR MONDE, chacun avec son nom,
-- sa couleur, sa position dans la hiérarchie et son jeu de permissions ; un
-- membre peut en cumuler plusieurs (ses permissions sont l'union). Le
-- propriétaire reste `worlds.owner_id`, hors hiérarchie : il a tout.
--
-- ── 1. Les tables ────────────────────────────────────────────
-- `world_roles` et `world_member_roles`. La liste des permissions valides est
-- une fonction IMMUTABLE (`world_permission_keys`) : le CHECK de la colonne s'y
-- réfère, et `lib/worldPermissions.ts` en tient le miroir (testé).
--
-- ── 2. Les prédicats ─────────────────────────────────────────
-- `has_world_permission(wid, uid, perm)` remplace `is_world_admin` et
-- `is_world_editor` dans TOUTES les politiques ; `world_rank` donne le rang
-- (position du plus haut rôle, propriétaire = maximum) qui borne ce qu'un
-- gestionnaire peut toucher : on ne gère que les rôles et les membres sous
-- son rang, et l'on ne confère que les permissions que l'on possède.
--
-- ── 3. La reprise ────────────────────────────────────────────
-- Chaque monde reçoit quatre rôles (Administrateur, Éditeur, Joueur par
-- défaut, Spectateur) qui reproduisent les paliers de l'enum, et chaque membre
-- reçoit celui qui correspond à son ancien rôle. Le propriétaire n'en reçoit
-- aucun : il n'en a pas besoin.
--
-- ── 4. Les politiques ────────────────────────────────────────
-- 29 politiques testaient l'enum en dur, 30 passaient par `is_world_editor`
-- ou `is_world_admin`. Toutes sont réécrites vers la permission précise ; les
-- branches qui ne parlent pas de rôle (créateur, propriétaire du persona,
-- corbeille, statut d'une relation…) sont conservées à l'identique.
--
-- ── 5. Ce qui reste, et ce qui part ──────────────────────────
-- `world_members.role` et `world_invitations.role` restent en place, plus
-- rien ne les lit ni ne les écrit : suppression dans une migration ultérieure,
-- une fois le code déployé (même fenêtre que pour `chatroom_reads`, 129).
-- `is_world_admin`, `is_world_editor` et `is_world_owner` ne sont plus citées
-- par aucune politique (vérifié ici) ; elles deviennent des enveloppes de
-- `has_world_permission` le temps du déploiement — le client déjà en
-- production appelle encore le RPC `is_world_admin` — et partiront avec la
-- colonne.

-- ── 1. Les tables ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.world_permission_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY[
    -- Général
    'administrator', 'world.settings', 'roles.manage', 'members.manage',
    -- Salons
    'messages.post', 'chatrooms.create', 'chatrooms.manage', 'categories.manage',
    -- Contenu
    'tabs.edit', 'wiki.edit', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit',
    -- Personas
    'relations.manage',
    -- Mentions
    'mentions.roles', 'mentions.everyone'
  ]::text[];
$$;

CREATE TABLE IF NOT EXISTS public.world_roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id     uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  name         text NOT NULL,
  color        text NOT NULL DEFAULT '#94a3b8',
  lucide_icon  text,
  -- Plus grand = plus haut dans la hiérarchie.
  position     integer NOT NULL DEFAULT 0,
  permissions  text[] NOT NULL DEFAULT '{}',
  -- Attribué à qui rejoint le monde (invitation sans rôle, monde public).
  is_default   boolean NOT NULL DEFAULT false,
  -- N'importe quel membre peut le mentionner ; sinon il faut `mentions.roles`.
  mentionable  boolean NOT NULL DEFAULT false,
  -- Ses membres forment un groupe à part dans la liste des membres.
  hoist        boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, name),
  CONSTRAINT world_roles_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT world_roles_color_hex CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT world_roles_permissions_known CHECK (permissions <@ public.world_permission_keys())
);
ALTER TABLE public.world_roles ADD CONSTRAINT world_roles_name_len CHECK (char_length(name) <= 40);
ALTER TABLE public.world_roles ADD CONSTRAINT world_roles_lucide_icon_len CHECK (char_length(lucide_icon) <= 100);
CREATE INDEX IF NOT EXISTS world_roles_world_idx ON public.world_roles (world_id, position DESC);

CREATE TABLE IF NOT EXISTS public.world_member_roles (
  world_id  uuid NOT NULL,
  user_id   uuid NOT NULL,
  role_id   uuid NOT NULL REFERENCES public.world_roles(id) ON DELETE CASCADE,
  PRIMARY KEY (world_id, user_id, role_id),
  FOREIGN KEY (world_id, user_id) REFERENCES public.world_members(world_id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS world_member_roles_role_idx ON public.world_member_roles (role_id);

-- Un rôle appartient au même monde que le membre qui le porte.
CREATE OR REPLACE FUNCTION public.tg_world_member_roles_same_world()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.world_roles r WHERE r.id = NEW.role_id AND r.world_id = NEW.world_id) THEN
    RAISE EXCEPTION 'Ce rôle n''appartient pas à ce monde.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_world_member_roles_same_world() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_world_member_roles_same_world ON public.world_member_roles;
CREATE TRIGGER trg_world_member_roles_same_world
  BEFORE INSERT OR UPDATE ON public.world_member_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_member_roles_same_world();

ALTER TABLE public.world_invitations
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.world_roles(id) ON DELETE SET NULL;

-- Le propriétaire est `worlds.owner_id` : l'index qui garantissait un seul
-- `role = 'owner'` par monde n'a plus d'objet, et la colonne cesse d'être
-- alimentée.
DROP INDEX IF EXISTS public.uniq_world_owner;
ALTER TABLE public.world_members ALTER COLUMN role DROP NOT NULL;
ALTER TABLE public.world_members ALTER COLUMN role DROP DEFAULT;

-- ── 2. Les prédicats ─────────────────────────────────────────

-- Permissions effectives : `{administrator}` pour le propriétaire, sinon
-- l'union des rôles portés. Vide pour un non-membre.
CREATE OR REPLACE FUNCTION public.world_permissions_of(wid uuid, uid uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN uid IS NULL THEN '{}'::text[]
    WHEN EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = wid AND w.owner_id = uid)
      THEN ARRAY['administrator']::text[]
    ELSE coalesce(
      (SELECT array_agg(DISTINCT p)
         FROM public.world_member_roles mr
         JOIN public.world_roles r ON r.id = mr.role_id
         CROSS JOIN LATERAL unnest(r.permissions) AS p
        WHERE mr.world_id = wid AND mr.user_id = uid),
      '{}'::text[])
  END;
$$;
REVOKE ALL ON FUNCTION public.world_permissions_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.world_permissions_of(uuid, uuid) TO authenticated;

-- `administrator` vaut pour toute permission.
CREATE OR REPLACE FUNCTION public.has_world_permission(wid uuid, uid uuid, perm text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = wid AND w.owner_id = uid)
    OR EXISTS (
      SELECT 1
        FROM public.world_member_roles mr
        JOIN public.world_roles r ON r.id = mr.role_id
       WHERE mr.world_id = wid AND mr.user_id = uid
         AND r.permissions && ARRAY['administrator', perm]::text[]
    )
  );
$$;
REVOKE ALL ON FUNCTION public.has_world_permission(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_world_permission(uuid, uuid, text) TO authenticated;

-- Rang dans la hiérarchie : position du plus haut rôle porté ; le
-- propriétaire est au-dessus de tout ; -1 sans rôle (ou non-membre).
CREATE OR REPLACE FUNCTION public.world_rank(wid uuid, uid uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.worlds w WHERE w.id = wid AND w.owner_id = uid)
      THEN 2147483647
    ELSE coalesce(
      (SELECT max(r.position)
         FROM public.world_member_roles mr
         JOIN public.world_roles r ON r.id = mr.role_id
        WHERE mr.world_id = wid AND mr.user_id = uid),
      -1)
  END;
$$;
REVOKE ALL ON FUNCTION public.world_rank(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.world_rank(uuid, uuid) TO authenticated;

-- Les quatre rôles de départ d'un monde. Rejouable : un nom déjà pris est
-- laissé tel quel.
CREATE OR REPLACE FUNCTION public.seed_default_world_roles(wid uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.world_roles (world_id, name, color, position, permissions, is_default, mentionable, hoist)
  VALUES
    (wid, 'Administrateur', '#ef4444', 30, ARRAY['administrator']::text[], false, false, true),
    (wid, 'Éditeur',        '#3b82f6', 20, ARRAY[
       'messages.post', 'chatrooms.create', 'chatrooms.manage', 'categories.manage',
       'tabs.edit', 'wiki.edit', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit',
       'mentions.roles']::text[], false, false, true),
    (wid, 'Joueur',         '#22c55e', 10, ARRAY['messages.post', 'chatrooms.create']::text[], true, false, true),
    (wid, 'Spectateur',     '#94a3b8',  0, '{}'::text[], false, false, true)
  ON CONFLICT (world_id, name) DO NOTHING;
$$;
-- Fonction interne, pas une RPC : Supabase accorde EXECUTE directement aux
-- rôles `anon` et `authenticated`, `FROM PUBLIC` seul ne les en prive pas.
REVOKE ALL ON FUNCTION public.seed_default_world_roles(uuid) FROM PUBLIC, anon, authenticated;

-- Attribue à un membre les rôles par défaut du monde.
CREATE OR REPLACE FUNCTION public.grant_default_world_roles(wid uuid, uid uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.world_member_roles (world_id, user_id, role_id)
  SELECT wid, uid, r.id FROM public.world_roles r WHERE r.world_id = wid AND r.is_default
  ON CONFLICT DO NOTHING;
$$;
REVOKE ALL ON FUNCTION public.grant_default_world_roles(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. La reprise ────────────────────────────────────────────

SELECT public.seed_default_world_roles(w.id) FROM public.worlds w;

INSERT INTO public.world_member_roles (world_id, user_id, role_id)
SELECT m.world_id, m.user_id, r.id
  FROM public.world_members m
  JOIN public.world_roles r
    ON r.world_id = m.world_id
   AND r.name = CASE m.role::text
                  WHEN 'admin'  THEN 'Administrateur'
                  WHEN 'editor' THEN 'Éditeur'
                  WHEN 'player' THEN 'Joueur'
                  WHEN 'viewer' THEN 'Spectateur'
                END
 WHERE m.role IS NOT NULL AND m.role::text <> 'owner'
ON CONFLICT DO NOTHING;

-- ── Les fonctions qui écrivaient le rôle ─────────────────────

-- Le propriétaire devient membre, et son monde reçoit ses rôles de départ.
CREATE OR REPLACE FUNCTION public.trg_worlds_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.world_members (world_id, user_id)
  VALUES (NEW.id, NEW.owner_id)
  ON CONFLICT DO NOTHING;
  PERFORM public.seed_default_world_roles(NEW.id);
  RETURN NEW;
END;
$$;

-- L'invitation porte un rôle (`role_id`) ou aucun : dans ce cas, les rôles par
-- défaut. Un membre déjà présent qui accepte une invitation reçoit ce rôle en
-- plus des siens.
CREATE OR REPLACE FUNCTION public.accept_world_invitation(p_world_id uuid, p_age_confirmed boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_id        uuid;
  v_has_invitation boolean;
  v_age_restricted boolean;
BEGIN
  SELECT role_id, true INTO v_role_id, v_has_invitation
  FROM public.world_invitations
  WHERE world_id = p_world_id
    AND invitee_id = auth.uid();

  IF NOT coalesce(v_has_invitation, false) THEN
    RAISE EXCEPTION 'Aucune invitation en attente pour ce monde.';
  END IF;

  SELECT is_age_restricted INTO v_age_restricted
  FROM public.worlds
  WHERE id = p_world_id;

  IF v_age_restricted AND NOT p_age_confirmed THEN
    RAISE EXCEPTION 'Confirmation d''âge requise pour rejoindre ce monde.';
  END IF;

  INSERT INTO public.world_members (world_id, user_id, age_confirmed_at)
  VALUES (p_world_id, auth.uid(), CASE WHEN v_age_restricted THEN now() ELSE NULL END)
  ON CONFLICT (world_id, user_id) DO NOTHING;

  IF v_role_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.world_roles r WHERE r.id = v_role_id AND r.world_id = p_world_id) THEN
    INSERT INTO public.world_member_roles (world_id, user_id, role_id)
    VALUES (p_world_id, auth.uid(), v_role_id)
    ON CONFLICT DO NOTHING;
  ELSE
    PERFORM public.grant_default_world_roles(p_world_id, auth.uid());
  END IF;

  DELETE FROM public.world_invitations
  WHERE world_id = p_world_id
    AND invitee_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.join_public_world(p_world_id uuid, p_age_confirmed boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_age_restricted boolean;
BEGIN
  SELECT is_age_restricted INTO v_age_restricted
  FROM public.worlds
  WHERE id = p_world_id
    AND visibility = 'public'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce monde n''est pas accessible au public.';
  END IF;

  IF v_age_restricted AND NOT p_age_confirmed THEN
    RAISE EXCEPTION 'Confirmation d''âge requise pour rejoindre ce monde.';
  END IF;

  INSERT INTO public.world_members (world_id, user_id, age_confirmed_at)
  VALUES (p_world_id, auth.uid(), CASE WHEN v_age_restricted THEN now() ELSE NULL END)
  ON CONFLICT (world_id, user_id) DO NOTHING;

  PERFORM public.grant_default_world_roles(p_world_id, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.search_users_for_world(p_world uuid, p_q text, p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, email text, username text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  select u.id as user_id, u.email, p.username
  from auth.users u
  join public.profiles p on p.id = u.id
  where public.has_world_permission(p_world, auth.uid(), 'members.manage')
    and (
      lower(u.email) like '%'||lower(p_q)||'%' or
      (p.username is not null and lower(p.username) like '%'||lower(p_q)||'%')
    )
    and not exists (
      select 1 from public.world_members wm
      where wm.world_id = p_world and wm.user_id = u.id
    )
  order by
    case when lower(u.email) = lower(p_q) then 0 else 1 end,
    u.email
  limit greatest(coalesce(p_limit,10), 1)
$$;

-- ── 4. Les politiques ────────────────────────────────────────

-- ── world_roles ───────────────────────────────────────────────
-- Écrire un rôle : `roles.manage`, un rôle sous son rang (avant comme après
-- la modification), et pas plus de permissions que l'on en a soi-même.
ALTER TABLE public.world_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "world_roles_select" ON public.world_roles FOR SELECT TO authenticated USING (
  public.is_world_member(world_id, (select auth.uid()))
  OR public.is_world_owner_direct(world_id, (select auth.uid()))
);
CREATE POLICY "world_roles_insert" ON public.world_roles FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'roles.manage')
  AND position < public.world_rank(world_id, (select auth.uid()))
  AND permissions <@ (
    CASE WHEN 'administrator' = ANY (public.world_permissions_of(world_id, (select auth.uid())))
         THEN public.world_permission_keys()
         ELSE public.world_permissions_of(world_id, (select auth.uid())) END)
);
CREATE POLICY "world_roles_update" ON public.world_roles FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'roles.manage')
  AND position < public.world_rank(world_id, (select auth.uid()))
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'roles.manage')
  AND position < public.world_rank(world_id, (select auth.uid()))
  AND permissions <@ (
    CASE WHEN 'administrator' = ANY (public.world_permissions_of(world_id, (select auth.uid())))
         THEN public.world_permission_keys()
         ELSE public.world_permissions_of(world_id, (select auth.uid())) END)
);
CREATE POLICY "world_roles_delete" ON public.world_roles FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'roles.manage')
  AND position < public.world_rank(world_id, (select auth.uid()))
);

-- ── world_member_roles ────────────────────────────────────────
-- Attribuer ou retirer : `members.manage`, un rôle sous son rang, un membre
-- sous son rang.
ALTER TABLE public.world_member_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "world_member_roles_select" ON public.world_member_roles FOR SELECT TO authenticated USING (
  public.is_world_member(world_id, (select auth.uid()))
  OR public.is_world_owner_direct(world_id, (select auth.uid()))
);
CREATE POLICY "world_member_roles_insert" ON public.world_member_roles FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
  AND public.world_rank(world_id, user_id) < public.world_rank(world_id, (select auth.uid()))
  AND EXISTS (SELECT 1 FROM public.world_roles r
               WHERE r.id = role_id AND r.world_id = world_member_roles.world_id
                 AND r.position < public.world_rank(r.world_id, (select auth.uid())))
);
CREATE POLICY "world_member_roles_delete" ON public.world_member_roles FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
  AND public.world_rank(world_id, user_id) < public.world_rank(world_id, (select auth.uid()))
  AND EXISTS (SELECT 1 FROM public.world_roles r
               WHERE r.id = role_id AND r.world_id = world_member_roles.world_id
                 AND r.position < public.world_rank(r.world_id, (select auth.uid())))
);

-- ── world_members ─────────────────────────────────────────────
DROP POLICY IF EXISTS "members: self-leave" ON public.world_members;
DROP POLICY IF EXISTS "world_members_delete" ON public.world_members;
DROP POLICY IF EXISTS "world_members_insert" ON public.world_members;
DROP POLICY IF EXISTS "world_members_update" ON public.world_members;
CREATE POLICY "world_members_self_leave" ON public.world_members FOR DELETE TO authenticated USING (
  user_id = (select auth.uid())
  AND NOT public.is_world_owner_direct(world_id, (select auth.uid()))
);
CREATE POLICY "world_members_delete" ON public.world_members FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
  AND public.world_rank(world_id, user_id) < public.world_rank(world_id, (select auth.uid()))
);
CREATE POLICY "world_members_insert" ON public.world_members FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
);
CREATE POLICY "world_members_update" ON public.world_members FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
  AND public.world_rank(world_id, user_id) < public.world_rank(world_id, (select auth.uid()))
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
  AND public.world_rank(world_id, user_id) < public.world_rank(world_id, (select auth.uid()))
);

-- ── world_invitations ─────────────────────────────────────────
DROP POLICY IF EXISTS "world_invitations: insert" ON public.world_invitations;
DROP POLICY IF EXISTS "world_invitations_delete_public_merged" ON public.world_invitations;
DROP POLICY IF EXISTS "world_invitations_select_public_merged" ON public.world_invitations;
CREATE POLICY "world_invitations_select" ON public.world_invitations FOR SELECT TO authenticated USING (
  invitee_id = (select auth.uid())
  OR inviter_id = (select auth.uid())
  OR public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
);
CREATE POLICY "world_invitations_insert" ON public.world_invitations FOR INSERT TO authenticated WITH CHECK (
  inviter_id = (select auth.uid())
  AND public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
  AND (role_id IS NULL OR EXISTS (
    SELECT 1 FROM public.world_roles r
     WHERE r.id = role_id AND r.world_id = world_invitations.world_id
       AND r.position < public.world_rank(r.world_id, (select auth.uid()))))
);
CREATE POLICY "world_invitations_delete" ON public.world_invitations FOR DELETE TO authenticated USING (
  invitee_id = (select auth.uid())
  OR inviter_id = (select auth.uid())
  OR public.has_world_permission(world_id, (select auth.uid()), 'members.manage')
);

-- ── worlds ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "worlds update by admin" ON public.worlds;
CREATE POLICY "worlds_update_settings" ON public.worlds FOR UPDATE TO authenticated USING (
  public.has_world_permission(id, (select auth.uid()), 'world.settings')
) WITH CHECK (
  public.has_world_permission(id, (select auth.uid()), 'world.settings')
);

-- ── chat_messages ─────────────────────────────────────────────
DROP POLICY IF EXISTS "messages insert (player+ & persona owned)" ON public.chat_messages;
CREATE POLICY "chat_messages_insert" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.chatrooms c
           WHERE c.id = chat_messages.chat_id
             AND public.has_world_permission(c.world_id, (select auth.uid()), 'messages.post'))
  AND public.owns_persona(persona_id, (select auth.uid()))
  AND public.is_persona_usable(persona_id, (select auth.uid()))
);

-- ── chatrooms ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "chatrooms insert if player or higher" ON public.chatrooms;
DROP POLICY IF EXISTS "chatrooms_update_authenticated_merged" ON public.chatrooms;
CREATE POLICY "chatrooms_insert" ON public.chatrooms FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'chatrooms.create')
);
CREATE POLICY "chatrooms_update" ON public.chatrooms FOR UPDATE TO authenticated USING (
  created_by = (select auth.uid())
  OR public.has_world_permission(world_id, (select auth.uid()), 'chatrooms.manage')
) WITH CHECK (
  created_by = (select auth.uid())
  OR public.has_world_permission(world_id, (select auth.uid()), 'chatrooms.manage')
);

-- ── chatroom_categories ───────────────────────────────────────
DROP POLICY IF EXISTS "chatroom_categories insert if editor" ON public.chatroom_categories;
DROP POLICY IF EXISTS "chatroom_categories update if editor" ON public.chatroom_categories;
DROP POLICY IF EXISTS "chatroom_categories delete if editor" ON public.chatroom_categories;
CREATE POLICY "chatroom_categories_insert" ON public.chatroom_categories FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'categories.manage')
);
CREATE POLICY "chatroom_categories_update" ON public.chatroom_categories FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'categories.manage')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'categories.manage')
);
CREATE POLICY "chatroom_categories_delete" ON public.chatroom_categories FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'categories.manage')
);

-- ── world_lexicon_terms ───────────────────────────────────────
DROP POLICY IF EXISTS "wlt_insert" ON public.world_lexicon_terms;
DROP POLICY IF EXISTS "wlt_update" ON public.world_lexicon_terms;
DROP POLICY IF EXISTS "wlt_delete" ON public.world_lexicon_terms;
CREATE POLICY "wlt_insert" ON public.world_lexicon_terms FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'lexicon.edit')
);
CREATE POLICY "wlt_update" ON public.world_lexicon_terms FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'lexicon.edit')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'lexicon.edit')
);
CREATE POLICY "wlt_delete" ON public.world_lexicon_terms FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'lexicon.edit')
);

-- ── world_tags ────────────────────────────────────────────────
DROP POLICY IF EXISTS "world_tags insert if editor" ON public.world_tags;
DROP POLICY IF EXISTS "world_tags delete if editor" ON public.world_tags;
CREATE POLICY "world_tags_insert" ON public.world_tags FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'tags.manage')
);
CREATE POLICY "world_tags_delete" ON public.world_tags FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'tags.manage')
);

-- ── world_wiki_pages ──────────────────────────────────────────
-- La lecture élargie (brouillons, corbeille, pages restreintes) suit le droit
-- d'édition, comme avant avec `is_world_editor`.
DROP POLICY IF EXISTS "wwp_select" ON public.world_wiki_pages;
DROP POLICY IF EXISTS "wwp_insert" ON public.world_wiki_pages;
DROP POLICY IF EXISTS "wwp_update" ON public.world_wiki_pages;
DROP POLICY IF EXISTS "wwp_delete" ON public.world_wiki_pages;
CREATE POLICY "wwp_select" ON public.world_wiki_pages FOR SELECT TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
  OR (public.is_world_member(world_id, (select auth.uid()))
      AND deleted_at IS NULL
      AND (is_folder OR published_at IS NOT NULL)
      AND NOT public.wwp_is_restricted(id))
);
CREATE POLICY "wwp_insert" ON public.world_wiki_pages FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
);
CREATE POLICY "wwp_update" ON public.world_wiki_pages FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
);
CREATE POLICY "wwp_delete" ON public.world_wiki_pages FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
);

DROP POLICY IF EXISTS "wwpv_select" ON public.world_wiki_page_versions;
CREATE POLICY "wwpv_select" ON public.world_wiki_page_versions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.world_wiki_pages p
           WHERE p.id = world_wiki_page_versions.page_id
             AND public.has_world_permission(p.world_id, (select auth.uid()), 'wiki.edit'))
);

-- ── world_wiki_page_annotations ───────────────────────────────
DROP POLICY IF EXISTS "wwpa_update" ON public.world_wiki_page_annotations;
DROP POLICY IF EXISTS "wwpa_delete" ON public.world_wiki_page_annotations;
CREATE POLICY "wwpa_update" ON public.world_wiki_page_annotations FOR UPDATE TO authenticated USING (
  author_id = (select auth.uid())
  OR public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
) WITH CHECK (
  (author_id = (select auth.uid())
   OR public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit'))
  AND world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = world_wiki_page_annotations.page_id)
);
CREATE POLICY "wwpa_delete" ON public.world_wiki_page_annotations FOR DELETE TO authenticated USING (
  author_id = (select auth.uid())
  OR public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
);

-- ── world_wiki_page_note_categories ───────────────────────────
DROP POLICY IF EXISTS "wwpnc_insert" ON public.world_wiki_page_note_categories;
DROP POLICY IF EXISTS "wwpnc_update" ON public.world_wiki_page_note_categories;
DROP POLICY IF EXISTS "wwpnc_delete" ON public.world_wiki_page_note_categories;
CREATE POLICY "wwpnc_insert" ON public.world_wiki_page_note_categories FOR INSERT TO authenticated WITH CHECK (
  world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = world_wiki_page_note_categories.page_id)
  AND public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
);
CREATE POLICY "wwpnc_update" ON public.world_wiki_page_note_categories FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
) WITH CHECK (
  world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = world_wiki_page_note_categories.page_id)
  AND public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
);
CREATE POLICY "wwpnc_delete" ON public.world_wiki_page_note_categories FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
);

-- ── world_wiki_page_notes ─────────────────────────────────────
DROP POLICY IF EXISTS "wwpn_insert" ON public.world_wiki_page_notes;
DROP POLICY IF EXISTS "wwpn_update" ON public.world_wiki_page_notes;
DROP POLICY IF EXISTS "wwpn_delete" ON public.world_wiki_page_notes;
CREATE POLICY "wwpn_insert" ON public.world_wiki_page_notes FOR INSERT TO authenticated WITH CHECK (
  world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = world_wiki_page_notes.page_id)
  AND page_id = (SELECT c.page_id FROM public.world_wiki_page_note_categories c WHERE c.id = world_wiki_page_notes.category_id)
  AND public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
);
CREATE POLICY "wwpn_update" ON public.world_wiki_page_notes FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
) WITH CHECK (
  world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = world_wiki_page_notes.page_id)
  AND page_id = (SELECT c.page_id FROM public.world_wiki_page_note_categories c WHERE c.id = world_wiki_page_notes.category_id)
  AND public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
);
CREATE POLICY "wwpn_delete" ON public.world_wiki_page_notes FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'wiki.edit')
);

-- ── Carte : world_maps, world_map_pins, world_map_regions, world_map_pin_links
DROP POLICY IF EXISTS "world_maps_insert" ON public.world_maps;
DROP POLICY IF EXISTS "world_maps_update" ON public.world_maps;
DROP POLICY IF EXISTS "world_maps_delete" ON public.world_maps;
CREATE POLICY "world_maps_insert" ON public.world_maps FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);
CREATE POLICY "world_maps_update" ON public.world_maps FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);
CREATE POLICY "world_maps_delete" ON public.world_maps FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);

DROP POLICY IF EXISTS "world_map_pins_insert" ON public.world_map_pins;
DROP POLICY IF EXISTS "world_map_pins_update" ON public.world_map_pins;
DROP POLICY IF EXISTS "world_map_pins_delete" ON public.world_map_pins;
CREATE POLICY "world_map_pins_insert" ON public.world_map_pins FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);
CREATE POLICY "world_map_pins_update" ON public.world_map_pins FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);
CREATE POLICY "world_map_pins_delete" ON public.world_map_pins FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);

DROP POLICY IF EXISTS "world_map_regions_insert" ON public.world_map_regions;
DROP POLICY IF EXISTS "world_map_regions_update" ON public.world_map_regions;
DROP POLICY IF EXISTS "world_map_regions_delete" ON public.world_map_regions;
CREATE POLICY "world_map_regions_insert" ON public.world_map_regions FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);
CREATE POLICY "world_map_regions_update" ON public.world_map_regions FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);
CREATE POLICY "world_map_regions_delete" ON public.world_map_regions FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);

DROP POLICY IF EXISTS "world_map_pin_links_insert" ON public.world_map_pin_links;
DROP POLICY IF EXISTS "world_map_pin_links_update" ON public.world_map_pin_links;
DROP POLICY IF EXISTS "world_map_pin_links_delete" ON public.world_map_pin_links;
CREATE POLICY "world_map_pin_links_insert" ON public.world_map_pin_links FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);
CREATE POLICY "world_map_pin_links_update" ON public.world_map_pin_links FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);
CREATE POLICY "world_map_pin_links_delete" ON public.world_map_pin_links FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'map.edit')
);

-- ── Catalogue : world_catalog_items, world_catalog_categories ─
-- La lecture de la corbeille suit le droit d'édition (migration 165).
DROP POLICY IF EXISTS "world_catalog_items_read" ON public.world_catalog_items;
DROP POLICY IF EXISTS "world_catalog_items_insert" ON public.world_catalog_items;
DROP POLICY IF EXISTS "world_catalog_items_update" ON public.world_catalog_items;
DROP POLICY IF EXISTS "world_catalog_items_delete" ON public.world_catalog_items;
CREATE POLICY "world_catalog_items_read" ON public.world_catalog_items FOR SELECT TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
  OR (deleted_at IS NULL AND public.is_world_member(world_id, (select auth.uid())))
);
CREATE POLICY "world_catalog_items_insert" ON public.world_catalog_items FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
);
CREATE POLICY "world_catalog_items_update" ON public.world_catalog_items FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
);
CREATE POLICY "world_catalog_items_delete" ON public.world_catalog_items FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
);

DROP POLICY IF EXISTS "wcc_insert" ON public.world_catalog_categories;
DROP POLICY IF EXISTS "wcc_update" ON public.world_catalog_categories;
DROP POLICY IF EXISTS "wcc_delete" ON public.world_catalog_categories;
CREATE POLICY "wcc_insert" ON public.world_catalog_categories FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
);
CREATE POLICY "wcc_update" ON public.world_catalog_categories FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
);
CREATE POLICY "wcc_delete" ON public.world_catalog_categories FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'catalog.edit')
);

-- ── Relations : types, groupes, assignations, relations ───────
-- Les types de relation n'étaient modifiables que par le propriétaire ; ils
-- rejoignent la même permission que les groupes.
DROP POLICY IF EXISTS "world_relation_types_insert" ON public.world_relation_types;
DROP POLICY IF EXISTS "world_relation_types_update" ON public.world_relation_types;
DROP POLICY IF EXISTS "world_relation_types_delete" ON public.world_relation_types;
CREATE POLICY "world_relation_types_insert" ON public.world_relation_types FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'relations.manage')
);
CREATE POLICY "world_relation_types_update" ON public.world_relation_types FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'relations.manage')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'relations.manage')
);
CREATE POLICY "world_relation_types_delete" ON public.world_relation_types FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'relations.manage')
);

DROP POLICY IF EXISTS "world_persona_groups_insert" ON public.world_persona_groups;
DROP POLICY IF EXISTS "world_persona_groups_update" ON public.world_persona_groups;
DROP POLICY IF EXISTS "world_persona_groups_delete" ON public.world_persona_groups;
CREATE POLICY "world_persona_groups_insert" ON public.world_persona_groups FOR INSERT TO authenticated WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'relations.manage')
);
CREATE POLICY "world_persona_groups_update" ON public.world_persona_groups FOR UPDATE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'relations.manage')
) WITH CHECK (
  public.has_world_permission(world_id, (select auth.uid()), 'relations.manage')
);
CREATE POLICY "world_persona_groups_delete" ON public.world_persona_groups FOR DELETE TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'relations.manage')
);

-- Reste un `FOR ALL` : le propriétaire du persona n'est pas forcément membre
-- du monde, la lecture ne le couvre donc pas (voir la migration 169).
DROP POLICY IF EXISTS "manage_assignments" ON public.persona_group_assignments;
CREATE POLICY "manage_assignments" ON public.persona_group_assignments FOR ALL TO authenticated USING (
  public.has_world_permission(world_id, (select auth.uid()), 'relations.manage')
  OR EXISTS (SELECT 1 FROM public.personas p
              WHERE p.id = persona_group_assignments.persona_id AND p.user_id = (select auth.uid()))
);

DROP POLICY IF EXISTS "players_create_relations" ON public.persona_relations;
DROP POLICY IF EXISTS "players_update_relations" ON public.persona_relations;
DROP POLICY IF EXISTS "players_delete_relations" ON public.persona_relations;
CREATE POLICY "players_create_relations" ON public.persona_relations FOR INSERT TO authenticated WITH CHECK (
  created_by = (select auth.uid())
  AND (public.owns_persona(from_persona_id, (select auth.uid()))
       OR public.has_world_permission(world_id, (select auth.uid()), 'relations.manage'))
  AND (status = 'accepted' OR public.relation_type_is_mutual(type))
  AND (status = 'pending' OR NOT public.relation_type_is_mutual(type)
       OR public.owns_persona(to_persona_id, (select auth.uid())))
);
CREATE POLICY "players_update_relations" ON public.persona_relations FOR UPDATE TO authenticated USING (
  public.owns_persona(from_persona_id, (select auth.uid()))
  OR public.has_world_permission(world_id, (select auth.uid()), 'relations.manage')
) WITH CHECK (
  (status = 'accepted' OR public.relation_type_is_mutual(type))
  AND (status = 'pending' OR NOT public.relation_type_is_mutual(type)
       OR public.owns_persona(to_persona_id, (select auth.uid())))
);
CREATE POLICY "players_delete_relations" ON public.persona_relations FOR DELETE TO authenticated USING (
  public.owns_persona(from_persona_id, (select auth.uid()))
  OR (public.owns_persona(to_persona_id, (select auth.uid()))
      AND (status = 'pending' OR public.relation_type_is_mutual(type)))
  OR public.has_world_permission(world_id, (select auth.uid()), 'relations.manage')
);

-- ── 5. Les anciens prédicats ─────────────────────────────────
-- Refuser de continuer si quelque chose les cite encore : une politique
-- orpheline échouerait à la première requête, en production.
DO $$
DECLARE
  v_policies int;
  v_functions int;
BEGIN
  SELECT count(*) INTO v_policies
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (coalesce(qual, '') ~ 'is_world_(admin|editor|owner)\('
          OR coalesce(with_check, '') ~ 'is_world_(admin|editor|owner)\('
          -- Le cast de l'enum, pas la table `world_roles` que citent les nouvelles politiques.
          OR coalesce(qual, '') ~ '::world_role'
          OR coalesce(with_check, '') ~ '::world_role');
  SELECT count(*) INTO v_functions
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'  -- pg_get_functiondef refuse les agrégats
     AND p.proname NOT IN ('is_world_admin', 'is_world_editor', 'is_world_owner')
     AND pg_get_functiondef(p.oid) ~ 'is_world_(admin|editor|owner)\(';
  IF v_policies > 0 OR v_functions > 0 THEN
    RAISE EXCEPTION 'Migration 176 : % politique(s) et % fonction(s) citent encore les anciens prédicats de rôle.', v_policies, v_functions;
  END IF;
END $$;

-- Enveloppes transitoires : l'ancien client encore déployé appelle
-- `is_world_admin` pour afficher le lien des réglages. À supprimer avec
-- `world_members.role`.
CREATE OR REPLACE FUNCTION public.is_world_admin(wid uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.has_world_permission(wid, uid, 'world.settings'); $$;

CREATE OR REPLACE FUNCTION public.is_world_editor(wid uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.has_world_permission(wid, uid, 'tabs.edit'); $$;

CREATE OR REPLACE FUNCTION public.is_world_owner(wid uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT public.is_world_owner_direct(wid, uid); $$;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT count(*) FROM public.world_roles;                                       -- → 4 × nb de mondes
-- SELECT (SELECT count(*) FROM public.world_members WHERE role IS NOT NULL AND role::text <> 'owner')
--      = (SELECT count(*) FROM public.world_member_roles);                       -- → true
-- SELECT count(*) FROM pg_policies WHERE schemaname='public'
--    AND (coalesce(qual,'')||coalesce(with_check,'')) ~ '::world_role|is_world_(admin|editor|owner)\('; -- → 0
-- SELECT public.has_world_permission('<world>', '<owner>', 'wiki.edit');         -- → true

-- ── ROLLBACK ─────────────────────────────────────────────────
-- `world_members.role` est intact : restaurer `is_world_admin/editor/owner`
-- depuis `.backup` (l. 1343-1405) et rejouer les politiques des migrations
-- 039, 090, 122, 133, 161-169, 173-174 ; `trg_worlds_after_insert`,
-- `accept_world_invitation` (122) et `join_public_world` (087) idem. Les deux
-- tables et les fonctions de cette migration peuvent alors être supprimées.
