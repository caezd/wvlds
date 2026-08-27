-- ============================================================
-- Migration 117 — Fuite : les tentatives gagnées étaient publiques
-- ============================================================
-- `challenge_attempts` portait deux policies SELECT permissives :
--   • "challenge_attempts: owner read"  → user_id = auth.uid()      (correcte)
--   • "challenge_attempts: read won"    → status = 'won'            (trop large)
-- Les policies permissives s'additionnant en OR, la seconde annulait la
-- première : n'importe qui — y compris le rôle `anon`, sans être connecté —
-- pouvait lire `user_id`, `chat_id` et `message_id` de TOUTES les tentatives
-- gagnées, y compris dans des mondes privés dont il n'est pas membre. Soit :
-- qui a participé, dans quel salon, et sur quel message.
--
-- La policy large existe pour une raison légitime : `loadChallengeBadges`
-- (app/(protected)/c/[id]/view.tsx) doit lire les tentatives gagnées des
-- AUTRES pour afficher le badge « défi remporté » sur leurs messages. On ne
-- peut donc pas se contenter de la supprimer — on la borne au monde du salon.
--
-- Après ce changement :
--   • membre du monde  → voit les tentatives gagnées de CE monde (badges OK) ;
--   • auteur           → voit toujours les siennes via "owner read" ;
--   • non-membre / anon → ne voit plus rien.
-- Mesuré avant application : un membre voyait 19 tentatives (dont 18 d'un
-- monde étranger), il en voit désormais 1 — la seule de son monde.

DROP POLICY IF EXISTS "challenge_attempts: read won" ON public.challenge_attempts;

CREATE POLICY "challenge_attempts: read won in own worlds" ON public.challenge_attempts
  FOR SELECT USING (
    status = 'won'
    AND chat_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM chatrooms c
      WHERE c.id = challenge_attempts.chat_id
        AND is_world_member(c.world_id, (select auth.uid()))
    )
  );

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ⚠️ Rétablit la fuite décrite ci-dessus — à n'utiliser qu'en dépannage.
-- DROP POLICY IF EXISTS "challenge_attempts: read won in own worlds" ON public.challenge_attempts;
-- CREATE POLICY "challenge_attempts: read won" ON public.challenge_attempts
--   FOR SELECT USING (status = 'won');
