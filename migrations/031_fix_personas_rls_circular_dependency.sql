-- Fix: boucle infinie RLS entre worlds et personas
-- "worlds: read by persona owner" (030) interroge personas.
-- "personas_readable_by_world_members" interrogeait worlds en retour → récursion infinie → HTTP 500.
-- Le check `worlds.owner_id = auth.uid()` est redondant : le owner est toujours dans world_members.

DROP POLICY IF EXISTS "personas_readable_by_world_members" ON public.personas;

CREATE POLICY "personas_readable_by_world_members"
  ON public.personas FOR SELECT
  USING (
    (world_id IS NOT NULL) AND (
      (user_id = auth.uid()) OR
      EXISTS (
        SELECT 1 FROM public.world_members wm
        WHERE wm.world_id = personas.world_id
          AND wm.user_id = auth.uid()
      )
    )
  );
