-- L'invité peut supprimer (refuser) sa propre invitation
CREATE POLICY "world_invitations: delete as invitee"
  ON public.world_invitations FOR DELETE
  USING (invitee_id = auth.uid());
