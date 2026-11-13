-- ─────────────────────────────────────────────────────────────
-- Migration 189 — La permission « Modifier les onglets » disparaît
--
-- `tabs.edit` protégeait les onglets descriptifs d'un monde
-- (`world_content_tabs`). Cette table n'existe plus, et la fonction qui
-- lisait la permission (`is_world_editor`) est tombée avec la migration 179 :
-- depuis, la case « Modifier les onglets » de l'écran des rôles conférait un
-- droit sur rien. Elle quitte la liste des permissions, et les rôles qui la
-- portaient — les « Éditeur » de chaque monde — la perdent.
--
-- L'ordre compte : la contrainte `world_roles_permissions_known` vérifie
-- `permissions <@ world_permission_keys()`. Nettoyer les lignes d'abord,
-- redéfinir la liste ensuite, sinon les rôles existants deviennent invalides
-- le temps de l'opération (la contrainte n'est pas revalidée par un
-- CREATE OR REPLACE, mais la prochaine écriture d'un de ces rôles échouerait).
-- ─────────────────────────────────────────────────────────────

-- ── 1. Les rôles perdent la permission ───────────────────────
UPDATE public.world_roles
   SET permissions = array_remove(permissions, 'tabs.edit')
 WHERE 'tabs.edit' = ANY (permissions);

-- ── 2. La liste canonique ────────────────────────────────────
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
    'wiki.edit', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit',
    -- Personas
    'relations.manage', 'personas.review', 'npc.manage', 'npc.play',
    -- Mentions
    'mentions.roles', 'mentions.everyone'
  ]::text[];
$$;

-- ── 3. Le rôle Éditeur des nouveaux mondes ───────────────────
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
       'wiki.edit', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit',
       'mentions.roles']::text[], false, false, true),
    (wid, 'Joueur',         '#22c55e', 10, ARRAY['messages.post', 'chatrooms.create']::text[], true, false, true),
    (wid, 'Spectateur',     '#94a3b8',  0, '{}'::text[], false, false, true)
  ON CONFLICT (world_id, name) DO NOTHING;
$$;
-- Fonction interne, pas une RPC : Supabase accorde EXECUTE directement aux
-- rôles `anon` et `authenticated`, `FROM PUBLIC` seul ne les en prive pas.
REVOKE ALL ON FUNCTION public.seed_default_world_roles(uuid) FROM PUBLIC, anon, authenticated;

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT count(*) FROM public.world_roles WHERE 'tabs.edit' = ANY (permissions);  -- → 0
-- SELECT 'tabs.edit' = ANY (public.world_permission_keys());                      -- → false
-- SELECT count(*) FROM pg_policies
--  WHERE coalesce(qual,'') || coalesce(with_check,'') LIKE '%tabs.edit%';         -- → 0
