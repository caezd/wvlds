-- 220 — Présence globale (`presence:app`) et chat en direct (`world-live:<id>`)
-- en privé.
--
-- Les deux derniers canaux Realtime publics de l'application, tous deux de
-- présence :
--   - `presence:app` : chaque utilisateur connecté y annonce son pseudo, son
--     avatar et l'heure de sa dernière activité. Public, n'importe qui muni de
--     la clé publique de l'application pouvait voir en direct tous les
--     utilisateurs en ligne — et y injecter une fausse présence.
--   - `world-live:<id>` : qui regarde le chat en direct d'un monde. Public, un
--     non-membre voyait les spectateurs d'un monde.
--
-- Le client les ouvre désormais en privé (components/providers/
-- PresenceProvider, hooks/useWorldLiveChat). Realtime vérifie ces policies :
--   - `presence:app` : tout compte connecté (la présence globale montre les
--     membres de tous les mondes, comme avant) ;
--   - `world-live:<id>` : membres du monde, comme la lecture du chat.
--
-- Limite : une policy ne voit pas le contenu d'une présence annoncée. Un compte
-- connecté peut donc toujours annoncer la présence d'un autre `user_id`. Ce qui
-- disparaît, c'est l'accès sans compte (et sans être membre, pour le chat).
--
-- Comme pour 218 et 219 : appliquer AVANT de déployer le client. Le temps que
-- tous les onglets soient rechargés, ceux restés sur l'ancien client (canaux
-- publics) et les autres (canaux privés) ne se voient pas en ligne.

CREATE POLICY "wvlds_presence_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'presence'
    AND (
      (SELECT realtime.topic()) = 'presence:app'
      OR (
        (SELECT realtime.topic()) ~ '^world-live:[0-9a-f-]{36}$'
        AND public.is_world_member(substr((SELECT realtime.topic()), 12)::uuid, (SELECT auth.uid()))
      )
    )
  );

CREATE POLICY "wvlds_presence_write"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    extension = 'presence'
    AND (
      (SELECT realtime.topic()) = 'presence:app'
      OR (
        (SELECT realtime.topic()) ~ '^world-live:[0-9a-f-]{36}$'
        AND public.is_world_member(substr((SELECT realtime.topic()), 12)::uuid, (SELECT auth.uid()))
      )
    )
  );
