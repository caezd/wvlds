-- ============================================================
-- Migration 024 — Correctifs RLS invitations de monde
-- ============================================================

-- ── 1. Autoriser l'insertion de notifications world_invite côté client ──
-- La policy d'insertion existante ne couvre que type='mention'.
-- Les invitations sont envoyées directement depuis le navigateur de l'inviteur.
CREATE POLICY "notifications: insert world_invite"
  ON public.notifications FOR INSERT
  WITH CHECK (
    type = 'world_invite'
    AND actor_id = auth.uid()
    AND recipient_id != auth.uid()
  );

-- ── 2. Permettre aux managers de lire toutes les invitations de leur monde ──
-- La policy existante ne couvre que invitee ou inviter direct.
-- Un admin qui n'est pas l'inviteur original ne pouvait pas voir les invitations.
CREATE POLICY "world_invitations: read as manager"
  ON public.world_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.world_members
      WHERE world_id = world_invitations.world_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- ── 3. Permettre aux managers d'annuler une invitation ──────────────────
CREATE POLICY "world_invitations: delete as manager"
  ON public.world_invitations FOR DELETE
  USING (
    inviter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.world_members
      WHERE world_id = world_invitations.world_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
