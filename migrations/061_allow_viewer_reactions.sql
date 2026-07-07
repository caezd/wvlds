-- ============================================================
-- Migration 061 — Autoriser tous les membres (y compris "viewer") à réagir
-- ============================================================
--
-- Bug : un membre du monde avec le rôle "viewer" (spectateur, ne participant
-- pas activement à la chatroom) ne pouvait pas insérer de réaction : la policy
-- RLS "reactions: insert own (player+)" (migration align_world_role_permissions,
-- appliquée en base mais absente du dépôt) exigeait un rôle in
-- ('owner','admin','editor','player'). L'INSERT était donc rejeté par RLS avant
-- même d'atteindre la table — la réaction n'était jamais créée, et le trigger
-- notify_on_reaction() ne se déclenchait donc jamais : l'auteur du post ne
-- recevait aucune notification.
--
-- Cette policy est déjà déployée en production sous ce même nom depuis le
-- 2026-07-01 (migration distante "allow_viewer_reactions", jamais rapatriée
-- dans ce dépôt). On la rejoue ici pour que toute base reconstruite à partir
-- des migrations du dépôt (dev, CI, nouvel environnement) obtienne le
-- correctif — sinon elle repartirait de la policy permissive d'origine
-- (001_missing_tables.sql, sans vérification de membre) ou, si
-- align_world_role_permissions est rejouée séparément, de la policy
-- restrictive "player+" qui reproduit le bug.

DROP POLICY IF EXISTS "reactions: insert own" ON public.chat_message_reactions;
DROP POLICY IF EXISTS "reactions: insert own (player+)" ON public.chat_message_reactions;
DROP POLICY IF EXISTS "reactions: insert own (member)" ON public.chat_message_reactions;

CREATE POLICY "reactions: insert own (member)"
  ON public.chat_message_reactions
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.chatrooms c
      JOIN public.world_members wm ON wm.world_id = c.world_id
      WHERE c.id = chat_message_reactions.chat_id
        AND wm.user_id = (SELECT auth.uid())
    )
  );
