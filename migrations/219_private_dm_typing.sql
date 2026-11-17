-- 219 — Canal « … écrit » d'une conversation privée (`dm:<id>:messages`) en privé.
--
-- Depuis la migration 214, ce canal ne sert plus qu'au broadcast `typing` (les
-- messages eux-mêmes passent par le canal personnel `msgs:<user>`). Il était
-- PUBLIC : quiconque connaissait l'identifiant d'une conversation pouvait voir
-- quand l'un des deux interlocuteurs écrivait.
--
-- Le client l'ouvre désormais en privé (components/providers/DmsProvider).
-- Seuls les deux participants de la conversation peuvent le rejoindre (SELECT)
-- et y émettre (INSERT) — même règle que la lecture de `dm_messages`.
--
-- Comme pour la migration 218 : appliquer AVANT de déployer le client ; un
-- onglet resté sur l'ancien client ne voit plus le « … écrit » des onglets à
-- jour, et inversement, jusqu'au rechargement.

CREATE POLICY "wvlds_dm_typing_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'
    AND (SELECT realtime.topic()) ~ '^dm:[0-9a-f-]{36}:messages$'
    AND EXISTS (
      SELECT 1
      FROM public.dm_conversations c
      WHERE c.id = substr((SELECT realtime.topic()), 4, 36)::uuid
        AND (SELECT auth.uid()) IN (c.participant_a, c.participant_b)
    )
  );

CREATE POLICY "wvlds_dm_typing_write"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    extension = 'broadcast'
    AND (SELECT realtime.topic()) ~ '^dm:[0-9a-f-]{36}:messages$'
    AND EXISTS (
      SELECT 1
      FROM public.dm_conversations c
      WHERE c.id = substr((SELECT realtime.topic()), 4, 36)::uuid
        AND (SELECT auth.uid()) IN (c.participant_a, c.participant_b)
    )
  );
