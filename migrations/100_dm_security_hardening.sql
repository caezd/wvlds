-- SECURITY FIX : durcissement des DMs suite aux advisors Supabase.
--
-- 1. Les 3 RPC SECURITY DEFINER des DMs (find_or_create_dm, get_dm_conversations,
--    count_common_worlds) n'avaient pas de search_path figé, contrairement aux
--    autres RPC du projet (cf. get_app_shell). Un search_path mutable permet en
--    théorie à un rôle de faire pointer un identifiant non qualifié vers un
--    schéma malveillant placé plus tôt dans le search_path de la session.
--
-- 2. Les tables dm_conversations/dm_messages/dm_reads et la RPC
--    get_dm_conversations() héritaient des privilèges par défaut accordés à
--    `anon` à la création de la table (comportement standard Postgres/Supabase),
--    ce qui les rend découvrables dans le schéma GraphQL public sans être
--    authentifié. Les données restent protégées par RLS (auth.uid() est NULL
--    côté anon), mais ce n'est pas l'intention : ce sont des tables de
--    messagerie privée, `anon` n'a besoin d'aucun accès.

-- ── 1. Fige le search_path des 3 fonctions SECURITY DEFINER ──────────────────

ALTER FUNCTION public.find_or_create_dm(uuid) SET search_path = public;
ALTER FUNCTION public.get_dm_conversations() SET search_path = public;
ALTER FUNCTION public.count_common_worlds(uuid) SET search_path = public;

-- ── 2. Restreint l'exécution des RPC DM aux utilisateurs authentifiés ────────

REVOKE ALL ON FUNCTION public.find_or_create_dm(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_or_create_dm(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_dm_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dm_conversations() TO authenticated;

REVOKE ALL ON FUNCTION public.count_common_worlds(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_common_worlds(uuid) TO authenticated;

-- ── 3. Retire tout privilège de `anon` sur les tables de DM ──────────────────
-- `authenticated` garde ses privilèges : RLS continue de filtrer les lignes
-- (chaque policy vérifie déjà participant_a/participant_b/user_id = auth.uid()).

REVOKE ALL ON public.dm_conversations FROM anon;
REVOKE ALL ON public.dm_messages FROM anon;
REVOKE ALL ON public.dm_reads FROM anon;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- GRANT ALL ON public.dm_conversations, public.dm_messages, public.dm_reads TO anon;
-- GRANT EXECUTE ON FUNCTION public.find_or_create_dm(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.get_dm_conversations() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.count_common_worlds(uuid) TO PUBLIC;
-- ALTER FUNCTION public.find_or_create_dm(uuid) RESET search_path;
-- ALTER FUNCTION public.get_dm_conversations() RESET search_path;
-- ALTER FUNCTION public.count_common_worlds(uuid) RESET search_path;
