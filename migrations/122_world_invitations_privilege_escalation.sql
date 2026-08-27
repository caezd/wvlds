-- ============================================================
-- Migration 122 — Escalade de privilèges par les invitations
-- ============================================================
-- Deux trous distincts dans `world_invitations`, permettant l'un comme
-- l'autre de devenir **admin de n'importe quel monde**, y compris privé.
-- Les deux ont été reproduits sur la base de production, puis annulés.
--
-- ── Trou n°1 : s'auto-inviter ────────────────────────────────
-- La policy d'insertion était :
--
--   world_invitations: insert   WITH CHECK (inviter_id = auth.uid())
--
-- Elle vérifie seulement qu'on ne se fait pas passer pour quelqu'un d'autre.
-- Rien sur le monde visé. Or `accept_world_invitation` est SECURITY DEFINER
-- et lit le rôle *dans la ligne d'invitation* pour écrire dans `world_members`
-- en contournant la RLS — à raison, c'est le principe. Enchaînement complet,
-- deux appels d'API depuis n'importe quel compte :
--
--   1. insert into world_invitations (world_id, invitee_id, inviter_id, role)
--      values (<monde de la victime>, self, self, 'admin')     → ACCEPTÉ
--   2. rpc('accept_world_invitation', { p_world_id })          → ACCEPTÉ
--   3. rôle obtenu dans le monde                               → admin
--
-- À partir de là : lecture de tous les salons et de tous les messages, accès
-- aux clés de chiffrement (devenues lisibles puisqu'on est membre, cf. 120),
-- gestion des membres, suppression de contenu.
--
-- ── Trou n°2 : se promouvoir avant d'accepter ────────────────
-- La policy de mise à jour était :
--
--   world_invitations: update own   USING (invitee_id = auth.uid())
--
-- Sans `WITH CHECK`, Postgres réutilise l'expression `USING` comme contrôle :
-- l'invité peut donc modifier sa propre ligne, et **rien ne contraint la
-- colonne `role`**. Un invité en « viewer » se met en « admin » puis accepte.
-- Vérifié : la mise à jour passe, la ligne stocke bien 'admin'.
--
-- Cette policy n'est de surcroît utilisée nulle part : l'application ne fait
-- jamais d'UPDATE sur cette table. Refuser une invitation la SUPPRIME
-- (components/notifications), l'annuler aussi (WorldInviteDialog), et
-- réinviter quelqu'un fait delete + insert — un commentaire du code note même
-- que le chemin UPDATE était déjà bloqué par la RLS. On la retire donc au
-- lieu de la réparer : moins de surface, aucun appelant.

-- ── Correctif n°1 : inviter exige d'être admin du monde ──────
DROP POLICY IF EXISTS "world_invitations: insert" ON public.world_invitations;
CREATE POLICY "world_invitations: insert" ON public.world_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    inviter_id = (select auth.uid())
    AND is_world_admin(world_id, (select auth.uid()))
  );

-- ── Correctif n°2 : plus d'UPDATE du tout ────────────────────
DROP POLICY IF EXISTS "world_invitations: update own" ON public.world_invitations;

-- ── Défense en profondeur ────────────────────────────────────
-- Même avec les policies corrigées, `accept_world_invitation` accorde
-- aveuglément le rôle qu'elle lit. Une invitation ne doit jamais conférer la
-- propriété d'un monde : `owner` est un rôle unique, transmis par un autre
-- chemin. On le refuse explicitement, pour que la fonction reste sûre même si
-- une ligne malformée arrivait un jour en base.
CREATE OR REPLACE FUNCTION public.accept_world_invitation(
  p_world_id uuid,
  p_age_confirmed boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role TEXT;
  v_age_restricted boolean;
BEGIN
  SELECT role::TEXT INTO v_role
  FROM public.world_invitations
  WHERE world_id = p_world_id
    AND invitee_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Aucune invitation en attente pour ce monde.';
  END IF;

  -- Une invitation ne confère jamais la propriété.
  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'Une invitation ne peut pas conférer la propriété du monde.';
  END IF;

  SELECT is_age_restricted INTO v_age_restricted
  FROM public.worlds
  WHERE id = p_world_id;

  IF v_age_restricted AND NOT p_age_confirmed THEN
    RAISE EXCEPTION 'Confirmation d''âge requise pour rejoindre ce monde.';
  END IF;

  INSERT INTO public.world_members (world_id, user_id, role, age_confirmed_at)
  VALUES (p_world_id, auth.uid(), v_role::world_role,
          CASE WHEN v_age_restricted THEN now() ELSE NULL END)
  ON CONFLICT (world_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  DELETE FROM public.world_invitations
  WHERE world_id = p_world_id
    AND invitee_id = auth.uid();
END;
$function$;

-- ── Cohérence : plus de policy ouverte au rôle `public` ──────
-- Les trois policies restantes étaient `TO public`, donc nominalement
-- ouvertes à `anon`. En pratique `anon` ne satisfait aucune de leurs
-- conditions (`auth.uid()` y vaut NULL, et NULL = x n'est jamais vrai), donc
-- ce resserrement ne change aucun comportement — il rend juste l'intention
-- lisible, comme en migration 121.
DROP POLICY IF EXISTS "world_invitations_select_public_merged" ON public.world_invitations;
CREATE POLICY "world_invitations_select_public_merged" ON public.world_invitations
  FOR SELECT TO authenticated
  USING (
    invitee_id = (select auth.uid())
    OR inviter_id = (select auth.uid())
    OR is_world_admin(world_id, (select auth.uid()))
  );

DROP POLICY IF EXISTS "world_invitations_delete_public_merged" ON public.world_invitations;
CREATE POLICY "world_invitations_delete_public_merged" ON public.world_invitations
  FOR DELETE TO authenticated
  USING (
    invitee_id = (select auth.uid())
    OR inviter_id = (select auth.uid())
    OR is_world_admin(world_id, (select auth.uid()))
  );

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Sous l'identité d'un non-membre, l'auto-invitation doit être REFUSÉE :
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub','<uid>','role','authenticated')::text, true);
--   INSERT INTO world_invitations (world_id, invitee_id, inviter_id, role)
--   VALUES ('<monde>', '<uid>', '<uid>', 'admin');   -- doit lever
--
-- Sous l'identité d'un invité légitime, l'UPDATE ne doit plus exister :
--   UPDATE world_invitations SET role='admin' WHERE invitee_id='<uid>';
--   -- doit affecter 0 ligne (aucune policy UPDATE)
--
-- Et le chemin légitime doit rester intact : un admin invite, l'invité
-- accepte, il obtient le rôle prévu par l'invitation.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ⚠️ Rétablit les deux escalades décrites ci-dessus — dépannage seulement.
-- DROP POLICY IF EXISTS "world_invitations: insert" ON public.world_invitations;
-- CREATE POLICY "world_invitations: insert" ON public.world_invitations
--   FOR INSERT TO public WITH CHECK (inviter_id = (select auth.uid()));
-- CREATE POLICY "world_invitations: update own" ON public.world_invitations
--   FOR UPDATE TO public USING (invitee_id = (select auth.uid()));
