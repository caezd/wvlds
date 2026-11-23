-- 237 — La chatbox (chat en direct, migration 202), activable par monde.
--
-- Le drapeau global `world_live_chat` ouvre la fonctionnalité au site ;
-- chaque monde choisit ensuite de l'activer, dans Paramètres › Fonctions.
-- Éteinte par défaut : allumer le drapeau n'ajoute pas un chat à tous les
-- mondes d'un coup.
--
-- La base fait foi : dans un monde qui ne l'a pas activée, les messages ne
-- se lisent ni ne s'écrivent (l'effacement reste permis, pour faire le
-- ménage). Les messages déjà là sont gardés et reviennent à la réactivation.

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS enable_live_chat boolean NOT NULL DEFAULT false;

ALTER POLICY world_live_messages_select ON public.world_live_messages
  USING (
    public.is_world_member(world_live_messages.world_id, (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.worlds w
       WHERE w.id = world_live_messages.world_id AND w.enable_live_chat
    )
  );

ALTER POLICY world_live_messages_insert ON public.world_live_messages
  WITH CHECK (
    user_id = (select auth.uid())
    AND public.is_world_member(world_live_messages.world_id, (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.worlds w
       WHERE w.id = world_live_messages.world_id AND w.enable_live_chat
    )
  );
