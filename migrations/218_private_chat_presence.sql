-- 218 — Canal de présence d'un salon (`chat:<id>`) en privé.
--
-- Ce canal porte la présence (qui est dans le salon) et le « … écrit » (événement
-- broadcast `typing`, avec pseudo et nom de persona). Il était PUBLIC : toute
-- personne munie de la clé publique de l'application pouvait le rejoindre et
-- voir qui se trouve dans un salon et qui y écrit, sans être membre du monde.
--
-- Le client l'ouvre désormais en privé (`config.private`, hooks/
-- usePresenceChannel). Realtime vérifie alors ces policies :
--   - SELECT : recevoir la présence et les broadcasts du canal ;
--   - INSERT : annoncer sa présence (`track`) et envoyer le « typing ».
-- Même règle que le canal `room:<id>` du salon (migration 212) et que la
-- lecture des salons : être membre du monde du salon.
--
-- Pendant le déploiement, un onglet resté sur l'ancien client (canal public) ne
-- voit pas les onglets à jour (canal privé), et inversement : un rechargement
-- suffit. Appliquer AVANT de déployer le client : les policies n'ont aucun
-- effet sur les canaux publics.

CREATE POLICY "wvlds_chat_presence_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension IN ('broadcast', 'presence')
    AND (SELECT realtime.topic()) ~ '^chat:[0-9a-f-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.chatrooms c
      WHERE c.id = substr((SELECT realtime.topic()), 6)::uuid
        AND public.is_world_member(c.world_id, (SELECT auth.uid()))
    )
  );

CREATE POLICY "wvlds_chat_presence_write"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    extension IN ('broadcast', 'presence')
    AND (SELECT realtime.topic()) ~ '^chat:[0-9a-f-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.chatrooms c
      WHERE c.id = substr((SELECT realtime.topic()), 6)::uuid
        AND public.is_world_member(c.world_id, (SELECT auth.uid()))
    )
  );
