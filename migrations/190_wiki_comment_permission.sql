-- ─────────────────────────────────────────────────────────────
-- Migration 190 — Commenter le wiki devient une permission à part
--
-- Jusqu'ici, écrire un commentaire ancré sur une page du wiki demandait la
-- seule appartenance au monde (`is_world_member`), et `wiki.edit` — très
-- large : créer, modifier, publier, supprimer des pages — servait à modérer
-- les fils des autres. Le propriétaire d'un monde ne pouvait donc pas ouvrir
-- la relecture à des joueurs sans leur confier tout le wiki, ni fermer les
-- commentaires à un rôle de passage.
--
-- `wiki.comment` couvre l'écriture d'un commentaire et des réponses.
-- `wiki.edit` garde la modération (modifier ou supprimer le fil d'un autre,
-- le résoudre) : c'est un droit plus lourd, il ne se déduit pas de l'autre.
--
-- Pour que personne ne perde la main du jour au lendemain, tous les rôles
-- existants reçoivent la permission — c'est exactement ce que la policy
-- accordait, puisque tout membre pouvait commenter. Les mondes créés
-- ensuite la donnent à Éditeur et Joueur ; Spectateur reste en lecture.
-- ─────────────────────────────────────────────────────────────

-- ── 1. La liste canonique ────────────────────────────────────
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
    'wiki.edit', 'wiki.comment', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit',
    -- Personas
    'relations.manage', 'personas.review', 'npc.manage', 'npc.play',
    -- Mentions
    'mentions.roles', 'mentions.everyone'
  ]::text[];
$$;

-- ── 2. Les rôles existants gardent ce qu'ils avaient ─────────
UPDATE public.world_roles
   SET permissions = permissions || ARRAY['wiki.comment']::text[]
 WHERE NOT ('wiki.comment' = ANY (permissions))
   AND NOT ('administrator' = ANY (permissions));

-- ── 3. Les rôles semés dans un nouveau monde ─────────────────
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
       'wiki.edit', 'wiki.comment', 'lexicon.edit', 'tags.manage', 'map.edit', 'catalog.edit',
       'mentions.roles']::text[], false, false, true),
    (wid, 'Joueur',         '#22c55e', 10, ARRAY['messages.post', 'chatrooms.create', 'wiki.comment']::text[], true, false, true),
    (wid, 'Spectateur',     '#94a3b8',  0, '{}'::text[], false, false, true)
  ON CONFLICT (world_id, name) DO NOTHING;
$$;
-- Fonction interne, pas une RPC : Supabase accorde EXECUTE directement aux
-- rôles `anon` et `authenticated`, `FROM PUBLIC` seul ne les en prive pas.
REVOKE ALL ON FUNCTION public.seed_default_world_roles(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. Écrire un commentaire demande la permission ───────────
-- Une policy par action ; `world_id` doit rester celui de la page, sinon un
-- commentaire écrit dans un monde se rattacherait à la page d'un autre.
DROP POLICY IF EXISTS wwpa_insert ON public.world_wiki_page_annotations;
CREATE POLICY wwpa_insert ON public.world_wiki_page_annotations
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (select auth.uid())
    AND world_id = (SELECT p.world_id FROM public.world_wiki_pages p WHERE p.id = page_id)
    AND public.has_world_permission(world_id, (select auth.uid()), 'wiki.comment')
  );

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT 'wiki.comment' = ANY (public.world_permission_keys());                    -- → true
-- SELECT count(*) FROM public.world_roles
--  WHERE NOT (permissions <@ public.world_permission_keys());                      -- → 0
-- SELECT with_check FROM pg_policies WHERE policyname = 'wwpa_insert';             -- → cite wiki.comment
