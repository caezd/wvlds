-- Permet à un utilisateur invité de lire un monde avant d'en être membre
CREATE POLICY "worlds: read by invitee"
  ON public.worlds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.world_invitations
      WHERE world_id = worlds.id
        AND invitee_id = auth.uid()
    )
  );
