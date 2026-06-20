-- Permet à un utilisateur de lire un monde s'il y possède au moins un persona,
-- même s'il n'en est plus membre (ex. après avoir quitté le monde).
CREATE POLICY "worlds: read by persona owner"
ON public.worlds FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.personas
    WHERE personas.world_id = worlds.id
      AND personas.user_id = auth.uid()
  )
);
