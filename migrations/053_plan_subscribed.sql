-- ============================================================
-- Migration 053 — Remplace les plans "pro"/"team" par "subscribed"
-- Plans valides désormais : free | subscribed | lifetime
-- subscribed et lifetime sont tous deux illimités (mondes + personas).
-- ============================================================

-- ── 1. Migre les données existantes (défensif, aucune ligne connue) ──
UPDATE public.profiles SET plan = 'subscribed' WHERE plan IN ('pro', 'team');

-- ── 2. Contrainte CHECK mise à jour ──────────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan = ANY (ARRAY['free'::text, 'subscribed'::text, 'lifetime'::text]));

-- ── 3. is_user_subscribed : illimité pour subscribed + lifetime ──
CREATE OR REPLACE FUNCTION public.is_user_subscribed(uid uuid)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  select coalesce(p.plan in ('subscribed', 'lifetime'), false)
  from public.profiles p
  where p.id = uid
$$;
