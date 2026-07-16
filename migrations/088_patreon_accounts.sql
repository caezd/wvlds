-- ============================================================
-- Migration 088 — Liaison Patreon → abonnement automatique
-- ============================================================
-- Lie un compte wvlds existant à un compte Patreon (flux OAuth maison, PAS un
-- provider Supabase Auth) pour piloter automatiquement `profiles.plan` :
--   active_patron avec un montant >= palier minimum  →  'subscribed'
--   sinon                                            →  'free'
--
-- Le seuil (PATREON_MIN_CENTS) et toute la règle de résolution vivent côté
-- application (lib/patreon/entitlement.ts) ; cette migration ne pose que le
-- schéma, la RLS et le garde-fou sur les plans posés à la main.
--
-- Sécurité : les tokens OAuth sont des secrets. La table est écrite uniquement
-- par le service_role (webhook / callback). Le client (authenticated) ne peut
-- lire que SON statut, et JAMAIS les colonnes de tokens (privilèges au niveau
-- colonne + RLS ligne).

-- ── 1. profiles.patreon_managed ──────────────────────────────
-- Vrai quand `plan` est piloté par Patreon. Empêche Patreon d'écraser un plan
-- accordé à la main (l'admin via PlanSelect remet ce flag à false) et protège
-- les comptes 'lifetime'. La résolution applicative ne rétrograde jamais un
-- 'lifetime' ni un plan dont patreon_managed = false.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS patreon_managed boolean NOT NULL DEFAULT false;

-- ── 2. patreon_accounts (1 ligne par utilisateur lié) ────────
CREATE TABLE IF NOT EXISTS public.patreon_accounts (
  user_id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Identité Patreon. UNIQUE = un compte Patreon ne peut être lié qu'à un
  -- seul compte wvlds.
  patreon_user_id  TEXT        NOT NULL UNIQUE,
  -- Secrets OAuth — service_role only (voir REVOKE plus bas).
  access_token     TEXT        NOT NULL,
  refresh_token    TEXT        NOT NULL,
  token_expires_at TIMESTAMPTZ,
  -- État de mécénat sur NOTRE campagne, tel que renvoyé par Patreon.
  patron_status    TEXT        CHECK (patron_status IN ('active_patron', 'declined_patron', 'former_patron')),
  -- Montant courant auquel le mécène a droit, en cents ; comparé à
  -- PATREON_MIN_CENTS côté application.
  entitled_cents   INTEGER     NOT NULL DEFAULT 0,
  last_synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Retrouver un utilisateur depuis un event webhook (payload = patreon_user_id).
CREATE INDEX IF NOT EXISTS idx_patreon_accounts_patreon_user
  ON public.patreon_accounts (patreon_user_id);

-- updated_at auto (trigger partagé, migration 000).
DROP TRIGGER IF EXISTS set_patreon_accounts_updated_at ON public.patreon_accounts;
CREATE TRIGGER set_patreon_accounts_updated_at
  BEFORE UPDATE ON public.patreon_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. RLS + privilèges colonne ──────────────────────────────
ALTER TABLE public.patreon_accounts ENABLE ROW LEVEL SECURITY;

-- On repart d'une table verrouillée : on retire les privilèges accordés par
-- défaut à anon/authenticated (Supabase les grant automatiquement sur les
-- nouvelles tables du schéma public), puis on ré-accorde au compte-goutte.
REVOKE ALL ON public.patreon_accounts FROM anon, authenticated;

-- L'utilisateur connecté peut lire UNIQUEMENT les colonnes non sensibles
-- (jamais access_token / refresh_token). La RLS ci-dessous limite en plus à
-- sa propre ligne.
GRANT SELECT (
  user_id, patreon_user_id, patron_status, entitled_cents,
  last_synced_at, created_at, updated_at
) ON public.patreon_accounts TO authenticated;

-- Toutes les écritures passent par le service_role (webhook / callback OAuth),
-- qui contourne la RLS. Aucune policy INSERT/UPDATE/DELETE côté client.
CREATE POLICY "patreon_accounts: read own row"
  ON public.patreon_accounts FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.patreon_accounts;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS patreon_managed;
