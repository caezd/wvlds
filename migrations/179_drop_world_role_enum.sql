-- ============================================================
-- Migration 179 — Fin de la reprise des rôles : l'enum `world_role` s'en va
-- ============================================================
-- La 176 a remplacé l'enum par les rôles par monde, en laissant en place ce
-- que le client encore déployé lisait : `world_members.role`,
-- `world_invitations.role`, et les enveloppes `is_world_admin/editor/owner`.
-- Les trois PR du chantier (#71, #72, #73) sont fusionnées et déployées le
-- 2026-09-19 : rien ne les lit plus. Cette migration ferme la fenêtre, comme
-- la 172 (catalogue) et la 175 (statut marital).
--
-- ── 1. Le déclencheur de garde ───────────────────────────────
-- `tg_world_members_guard` (177) protégeait `NEW.role` avec les autres
-- colonnes d'appartenance : la colonne partant, la comparaison part aussi.
--
-- ── 2. Les colonnes et le type ───────────────────────────────
-- `world_members.role` : le rôle vit dans `world_member_roles`.
-- `world_invitations.role` : `role_id` l'a remplacé (176).
-- `world_role` : plus aucune colonne ne le porte.
--
-- ── 3. Les buckets ───────────────────────────────────────────
-- La garde de la 176 ne regardait que le schéma `public` : onze politiques
-- de `storage.objects` citaient encore `is_world_editor` — et passaient donc
-- par l'enveloppe (`tabs.edit`), ce qui ne dit pas ce qu'elles protègent.
-- Chacune prend la permission de ce qu'elle range : images de catégories
-- → `categories.manage`, bannières de salons → le créateur ou
-- `chatrooms.manage`, images du wiki → `wiki.edit`, cartes et lieux →
-- `map.edit`, objets du catalogue → `catalog.edit`.
--
-- ── 4. Les enveloppes ────────────────────────────────────────
-- `is_world_admin`, `is_world_editor`, `is_world_owner` n'étaient plus que
-- des alias de `has_world_permission` pour le client d'avant. Une garde,
-- tous schémas confondus cette fois, vérifie qu'aucune politique ni fonction
-- ne les cite avant de les retirer.

-- ── 1. Le déclencheur de garde ───────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_world_members_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Les fonctions SECURITY DEFINER (confirm_world_age…) s'exécutent sous leur
  -- propriétaire : elles ne sont pas concernées.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.world_id <> OLD.world_id
     OR NEW.user_id <> OLD.user_id
     OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
     OR NEW.age_confirmed_at IS DISTINCT FROM OLD.age_confirmed_at THEN
    RAISE EXCEPTION 'Ces colonnes de world_members ne se modifient pas par une écriture directe.';
  END IF;

  -- Un gestionnaire ne change que le statut d'un autre membre.
  IF auth.uid() IS DISTINCT FROM OLD.user_id AND (
       NEW.bio IS DISTINCT FROM OLD.bio
    OR NEW.availability IS DISTINCT FROM OLD.availability
    OR NEW.timezone IS DISTINCT FROM OLD.timezone
    OR NEW.birthday_month IS DISTINCT FROM OLD.birthday_month
    OR NEW.birthday_day IS DISTINCT FROM OLD.birthday_day) THEN
    RAISE EXCEPTION 'Seul le membre modifie sa carte.';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Les colonnes et le type ───────────────────────────────

ALTER TABLE public.world_members DROP COLUMN IF EXISTS role;
ALTER TABLE public.world_invitations DROP COLUMN IF EXISTS role;
DROP TYPE IF EXISTS public.world_role;

-- ── 3. Les buckets ───────────────────────────────────────────

-- chatroom-categories : `world-<uuid>/…`
DROP POLICY IF EXISTS "chatroom_categories bucket insert if editor" ON storage.objects;
DROP POLICY IF EXISTS "chatroom_categories bucket update if editor" ON storage.objects;
DROP POLICY IF EXISTS "chatroom_categories bucket delete if editor" ON storage.objects;
CREATE POLICY "chatroom_categories bucket insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'chatroom-categories'
  AND name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
  AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'categories.manage')
);
CREATE POLICY "chatroom_categories bucket update" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'chatroom-categories'
  AND name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
  AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'categories.manage')
);
CREATE POLICY "chatroom_categories bucket delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'chatroom-categories'
  AND name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
  AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'categories.manage')
);

-- chatrooms : `chatroom-<uuid>/…` (icônes et bannières de salon) — le
-- créateur du salon, ou qui gère les salons des autres.
DROP POLICY IF EXISTS "chatrooms: editors write" ON storage.objects;
DROP POLICY IF EXISTS "chatrooms: editors update" ON storage.objects;
DROP POLICY IF EXISTS "chatrooms: editors delete" ON storage.objects;
CREATE POLICY "chatrooms: managers write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'chatrooms'
  AND name ~ '^chatroom-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
  AND EXISTS (SELECT 1 FROM public.chatrooms c
               WHERE c.id = (substring(objects.name, '^chatroom-([0-9a-fA-F-]{36})/'))::uuid
                 AND (c.created_by = (select auth.uid())
                      OR public.has_world_permission(c.world_id, (select auth.uid()), 'chatrooms.manage')))
);
CREATE POLICY "chatrooms: managers update" ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'chatrooms'
  AND EXISTS (SELECT 1 FROM public.chatrooms c
               WHERE c.id = (substring(objects.name, '^chatroom-([0-9a-fA-F-]{36})/'))::uuid
                 AND (c.created_by = (select auth.uid())
                      OR public.has_world_permission(c.world_id, (select auth.uid()), 'chatrooms.manage')))
);
CREATE POLICY "chatrooms: managers delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'chatrooms'
  AND EXISTS (SELECT 1 FROM public.chatrooms c
               WHERE c.id = (substring(objects.name, '^chatroom-([0-9a-fA-F-]{36})/'))::uuid
                 AND (c.created_by = (select auth.uid())
                      OR public.has_world_permission(c.world_id, (select auth.uid()), 'chatrooms.manage')))
);

-- chat-banners : `<chatroom uuid>/…`
DROP POLICY IF EXISTS "chat-banners: owner or editor delete" ON storage.objects;
CREATE POLICY "chat-banners: owner or manager delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'chat-banners'
  AND (owner = (select auth.uid())
       OR EXISTS (SELECT 1 FROM public.chatrooms c
                   WHERE c.id = (substring(objects.name, '^([0-9a-fA-F-]{36})/'))::uuid
                     AND public.has_world_permission(c.world_id, (select auth.uid()), 'chatrooms.manage')))
);

-- wiki : `world-<uuid>/page-<uuid>/…`
DROP POLICY IF EXISTS "wiki: editors write" ON storage.objects;
DROP POLICY IF EXISTS "wiki: editors delete" ON storage.objects;
CREATE POLICY "wiki: editors write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'wiki'
  AND name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/page-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
  AND EXISTS (SELECT 1 FROM public.world_wiki_pages p
               WHERE p.id = (substring(objects.name, '/page-([0-9a-fA-F-]{36})/'))::uuid
                 AND p.world_id = (substring(objects.name, '^world-([0-9a-fA-F-]{36})/'))::uuid
                 AND public.has_world_permission(p.world_id, (select auth.uid()), 'wiki.edit'))
);
CREATE POLICY "wiki: editors delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'wiki'
  AND name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
  AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'wiki.edit')
);

-- worlds : `world-<uuid>/(map|pin)-<uuid>/…` pour la carte, `item-<uuid>/…`
-- pour le catalogue — rien d'autre ne s'écrit sous ce préfixe (159, 163).
DROP POLICY IF EXISTS "worlds: map editors write" ON storage.objects;
DROP POLICY IF EXISTS "worlds: map editors delete" ON storage.objects;
CREATE POLICY "worlds: map and catalog editors write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'worlds'
  AND (
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(map|pin)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'map.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/item-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'catalog.edit'))
  )
);
CREATE POLICY "worlds: map and catalog editors delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'worlds'
  AND (
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/(map|pin)-'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'map.edit'))
    OR
    (name ~ '^world-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/item-'
     AND public.has_world_permission((substring(name, '^world-([0-9a-fA-F-]{36})/'))::uuid, (select auth.uid()), 'catalog.edit'))
  )
);

-- ── 4. Les enveloppes ────────────────────────────────────────

DO $$
DECLARE
  v_policies int;
  v_functions int;
BEGIN
  -- Tous les schémas : `storage.objects` a ses politiques aussi.
  SELECT count(*) INTO v_policies
    FROM pg_policies
   WHERE coalesce(qual, '') ~ 'is_world_(admin|editor|owner)\('
      OR coalesce(with_check, '') ~ 'is_world_(admin|editor|owner)\(';
  SELECT count(*) INTO v_functions
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prokind = 'f'
     AND p.proname NOT IN ('is_world_admin', 'is_world_editor', 'is_world_owner')
     AND pg_get_functiondef(p.oid) ~ 'is_world_(admin|editor|owner)\(';
  IF v_policies > 0 OR v_functions > 0 THEN
    RAISE EXCEPTION 'Migration 179 : % politique(s) et % fonction(s) citent encore les enveloppes.', v_policies, v_functions;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.is_world_admin(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_world_editor(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_world_owner(uuid, uuid);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT count(*) FROM pg_type WHERE typname = 'world_role';                          -- → 0
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name IN ('world_members','world_invitations') AND column_name = 'role'; -- → aucune
-- SELECT count(*) FROM pg_proc WHERE proname IN ('is_world_admin','is_world_editor','is_world_owner'); -- → 0

-- ── ROLLBACK ─────────────────────────────────────────────────
-- Les valeurs de `role` ne sont pas restaurables (le rôle vit désormais dans
-- `world_member_roles`, dont on pourrait redériver un palier). Recréer le
-- type et les colonnes depuis `.backup`, les enveloppes depuis la 176.
