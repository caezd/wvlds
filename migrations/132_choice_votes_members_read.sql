-- ============================================================
-- Migration 132 — Les votes de blocs « choix » ne fuient plus entre mondes
-- ============================================================
-- Fuite de lecture inter-mondes sur `chat_choice_votes`.
--
-- ── Le défaut ────────────────────────────────────────────────
-- L'écriture était soigneusement gardée : insérer ou modifier un vote exige
-- d'être membre du monde du salon, et de ne pas être l'auteur du message.
-- La lecture, elle, ne vérifiait rien :
--
--   CREATE POLICY "choice_votes: authenticated read" … FOR SELECT
--     TO authenticated USING (true);
--
-- N'importe quel compte connecté lisait donc TOUS les votes de TOUS les
-- mondes — `(message_id, chat_id, option_id, user_id, created_at)`, soit qui a
-- voté quoi, y compris dans des mondes privés qu'il n'a jamais rejoints.
--
-- Cette asymétrie entre la policy d'écriture et celle de lecture est le motif
-- qui avait déjà livré l'escalade de privilèges de la migration 121. Il vaut la
-- peine d'être rejoué sur chaque table.
--
-- ── Constaté sous une fausse identité, membre d'aucun monde ──
--   salons visibles       0   ← correct
--   messages visibles     0   ← correct
--   votes visibles        1   ← toute la table
--
-- ── Après ce correctif, mêmes mesures ────────────────────────
--   vu par un étranger    0
--   vu par un membre      1   ← inchangé, la fonctionnalité tient
--
-- ── Choix de la condition ────────────────────────────────────
-- `is_world_member` regarde exactement `world_members`, comme la policy
-- d'écriture. Lecture et écriture restent donc alignées : quiconque peut voter
-- peut lire les votes, ni plus ni moins. Un propriétaire absent de
-- `world_members` ne lit pas ces votes — mais il ne pouvait déjà pas en
-- déposer, l'écart n'est pas introduit ici.
--
-- Le temps réel suit sans rien changer : une souscription `postgres_changes`
-- est filtrée par la RLS, `useRealtimeChatSync` ne recevra donc que les votes
-- des salons dont l'utilisateur est membre.

DROP POLICY IF EXISTS "choice_votes: authenticated read" ON public.chat_choice_votes;

CREATE POLICY "choice_votes: members read" ON public.chat_choice_votes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chatrooms c
    WHERE c.id = chat_choice_votes.chat_id
      AND is_world_member(c.world_id, (select auth.uid()))
  ));

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Rejouer les deux mesures ci-dessus :
--
--   BEGIN;
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<uuid membre d''aucun monde>","role":"authenticated"}';
--   SELECT count(*) FROM public.chat_choice_votes;   -- → 0
--   ROLLBACK;
--
-- Et qu'il ne reste aucune policy de lecture inconditionnelle inattendue :
--   SELECT tablename, policyname FROM pg_policies
--    WHERE schemaname='public' AND cmd IN ('SELECT','ALL')
--      AND btrim(coalesce(qual,'')) IN ('true','(true)');
--   -- feature_flags et user_equipped_cosmetics restent volontairement ouvertes,
--   -- profiles aussi (annuaire des comptes).
