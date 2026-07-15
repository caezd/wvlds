-- ============================================================
-- Migration 089 — Verrouille les colonnes privilégiées de profiles
-- ============================================================
-- FAILLE CORRIGÉE (préexistante) : la policy `profiles_update_own_row` autorise
-- un utilisateur à modifier SA ligne, mais la RLS Postgres est par ligne, pas
-- par colonne. Les rôles anon/authenticated ayant le privilège UPDATE sur
-- TOUTES les colonnes, n'importe quel joueur connecté pouvait exécuter depuis
-- la console du navigateur :
--     update profiles set is_admin = true  where id = auth.uid();  -- escalade admin
--     update profiles set plan = 'lifetime' where id = auth.uid();  -- abonnement gratuit
--
-- Correctif : privilèges UPDATE au niveau colonne. On ne laisse à
-- `authenticated` que les colonnes réellement éditables par le joueur ; les
-- colonnes d'entitlement/rôle (plan, is_admin, is_subscribed, patreon_managed)
-- ne sont plus modifiables que par le service_role (panneau admin + webhook
-- Patreon), qui contourne la RLS.
--
-- ⚠️ Déploiement couplé : les écritures admin de `plan`/`is_admin` doivent
-- passer par le client service_role (voir app/(protected)/admin/users/page.tsx).
-- Appliquer cette migration ET déployer ce changement de code ensemble, sinon
-- le panneau admin ne pourra plus modifier plan/is_admin.

-- On repart d'une base propre : plus aucun UPDATE pour anon/authenticated…
REVOKE UPDATE ON public.profiles FROM anon, authenticated;

-- …puis liste blanche des colonnes éditables par l'utilisateur connecté.
-- (La policy profiles_update_own_row limite toujours à sa propre ligne.)
GRANT UPDATE (
  username,
  avatar_url,
  locale,
  message_font,
  message_text_size,
  message_text_align,
  bio,
  pronouns,
  last_seen_at,
  appear_offline
) ON public.profiles TO authenticated;

-- Note : anon ne conserve aucun UPDATE (il n'avait de toute façon pas de policy
-- UPDATE, mais on retire le grant résiduel par prudence). plan, is_admin,
-- is_subscribed, patreon_managed, id, created_at, last_world_id ne sont
-- volontairement PAS dans la liste blanche.

-- ── ROLLBACK ─────────────────────────────────────────────────
-- GRANT UPDATE ON public.profiles TO authenticated;  -- (rétablit l'état vulnérable)
