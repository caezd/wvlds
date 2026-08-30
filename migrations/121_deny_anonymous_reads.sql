-- ============================================================
-- Migration 121 — Ferme la lecture anonyme de profiles et des votes
-- ============================================================
-- Relevé sous le rôle `anon`, sans aucune authentification :
--   profiles           → 8 lignes lisibles (dont l'identification des 2 comptes
--                        administrateurs, et 2 bios)
--   chat_choice_votes  → qui a voté quoi, y compris dans des salons privés
--
-- Les deux policies étaient `FOR SELECT TO public USING (true)`. Le rôle
-- `public` couvre `anon` aussi bien qu'`authenticated` : la table était donc
-- ouverte à tout visiteur, sans compte.
--
-- Ce correctif ferme l'accès anonyme sans rien changer pour l'application :
-- aucune route atteignable sans session (`/auth/**`, `/offline`, le manifeste
-- PWA) ne lit ces tables. `getCurrentProfile()` sort d'ailleurs avant toute
-- requête quand l'identité est absente.
--
-- Ce qui n'est PAS tranché ici, volontairement : faut-il, au-delà, restreindre
-- `profiles` aux membres des mondes que l'on partage ? C'est un choix de
-- conception — pseudos et avatars ont une part de publicité assumée dans une
-- application sociale — et `profiles` est lu depuis tant d'endroits qu'un
-- resserrement mérite d'être vérifié à l'écran. Idem pour les votes, qui
-- gagneraient à suivre la visibilité de leur salon.

DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
CREATE POLICY "profiles: authenticated read" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "choice_votes: read all" ON public.chat_choice_votes;
CREATE POLICY "choice_votes: authenticated read" ON public.chat_choice_votes
  FOR SELECT TO authenticated
  USING (true);

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- Sous le rôle `anon`, doit renvoyer 0 partout :
--   SET LOCAL ROLE anon;
--   SELECT (SELECT count(*) FROM profiles), (SELECT count(*) FROM chat_choice_votes);
-- Sous un compte connecté, les comptes doivent être inchangés (8 et 1).

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "profiles: authenticated read" ON public.profiles;
-- CREATE POLICY "Enable read access for all users" ON public.profiles
--   FOR SELECT TO public USING (true);
-- DROP POLICY IF EXISTS "choice_votes: authenticated read" ON public.chat_choice_votes;
-- CREATE POLICY "choice_votes: read all" ON public.chat_choice_votes
--   FOR SELECT TO public USING (true);
