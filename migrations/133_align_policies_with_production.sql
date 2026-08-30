-- ============================================================
-- Migration 133 — Aligner les policies du dépôt sur la production
-- ============================================================
-- Suite de la 000 et de la 130, même défaut, dernier objet : les règles
-- d'accès. Quatre tables ont été corrigées directement depuis le tableau de
-- bord, sans qu'aucune migration ne l'enregistre.
--
-- Relevé du 2026-08-29, en rejouant `.backup` + `migrations/*` et en comparant
-- les 141 policies obtenues à celles de la production :
--
--   5 policies existent en production et NULLE PART dans le dépôt
--   4 policies subsistent dans le dépôt et n'existent plus en production
--
-- (Les policies `storage.*` et celles des tables supprimées — world_content_tabs
--  par la 119, world_member_reads par la 129 — ne sont pas comptées ici.)
--
-- ── Ce qu'une reconstruction depuis le dépôt produisait ──────
--
--   chat_message_reactions
--     dépôt       « reactions: read all in chat »  FOR SELECT USING (true)
--     production  « reactions: read if world member »
--     → toutes les réactions de tous les mondes lisibles par tout compte
--       connecté. C'est exactement la fuite fermée sur `chat_choice_votes`
--       par la migration 132, restée ouverte ici.
--
--   chat_messages
--     dépôt       (rien)
--     production  « messages delete own », « messages update own »
--     → plus personne ne pouvait modifier ni supprimer ses propres messages.
--
--   chatrooms
--     dépôt       « chatrooms insert if world member »
--     production  « chatrooms insert if player or higher »
--     → n'importe quel membre créait des salons, y compris un simple
--       spectateur.
--
--   worlds
--     dépôt       « update: owner/admin/editor »
--     production  « worlds update by admin »
--     → un éditeur modifiait les réglages du monde.
--
-- ── Effet sur la base actuelle : aucun ───────────────────────
-- La production est déjà dans cet état. Ce fichier l'enregistre, il ne la
-- change pas — vérifié en le rejouant : mêmes 141 policies, empreinte md5
-- identique. Sa valeur est pour la reconstruction.

-- ── chat_message_reactions ───────────────────────────────────

DROP POLICY IF EXISTS "reactions: read all in chat" ON public.chat_message_reactions;
DROP POLICY IF EXISTS "reactions: read if world member" ON public.chat_message_reactions;
CREATE POLICY "reactions: read if world member" ON public.chat_message_reactions
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.chatrooms c
    WHERE c.id = chat_message_reactions.chat_id
      AND is_world_member(c.world_id, (select auth.uid()))
  ));

-- ── chat_messages ────────────────────────────────────────────
-- La policy d'insertion du socle a été remplacée par « messages insert
-- (player+ & persona owned) », créée par une migration ultérieure. Seule
-- l'ancienne reste à retirer.

DROP POLICY IF EXISTS "messages insert (member + persona owned)" ON public.chat_messages;

DROP POLICY IF EXISTS "messages update own" ON public.chat_messages;
CREATE POLICY "messages update own" ON public.chat_messages
  FOR UPDATE TO public
  USING (author_id = (select auth.uid()))
  WITH CHECK (author_id = (select auth.uid()));

DROP POLICY IF EXISTS "messages delete own" ON public.chat_messages;
CREATE POLICY "messages delete own" ON public.chat_messages
  FOR DELETE TO public
  USING (author_id = (select auth.uid()));

-- ── chatrooms ────────────────────────────────────────────────

DROP POLICY IF EXISTS "chatrooms insert if world member" ON public.chatrooms;
DROP POLICY IF EXISTS "chatrooms insert if player or higher" ON public.chatrooms;
CREATE POLICY "chatrooms insert if player or higher" ON public.chatrooms
  FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.world_members wm
    WHERE wm.world_id = chatrooms.world_id
      AND wm.user_id = (select auth.uid())
      AND wm.role = ANY (ARRAY['owner'::world_role, 'admin'::world_role,
                               'editor'::world_role, 'player'::world_role])
  ));

-- ── worlds ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "update: owner/admin/editor" ON public.worlds;
DROP POLICY IF EXISTS "worlds update by admin" ON public.worlds;
CREATE POLICY "worlds update by admin" ON public.worlds
  FOR UPDATE TO public
  USING (is_world_admin(id, (select auth.uid())))
  WITH CHECK (is_world_admin(id, (select auth.uid())));

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Rejoué sur la production : 141 policies avant comme après, et empreinte
-- identique —
--   SELECT md5(string_agg(tablename||policyname||cmd||coalesce(qual,'')
--                         ||coalesce(with_check,''), '|'
--                         ORDER BY tablename, policyname))
--     FROM pg_policies WHERE schemaname = 'public';
--
-- Le contrôle `lib/__tests__/unconditionalReadPolicies.test.ts` refuse par
-- ailleurs toute nouvelle policy de lecture en `USING (true)` hors liste
-- assumée — c'est lui qui a fait remonter `reactions: read all in chat`.
