-- ============================================================
-- Migration 023 — Système d'invitations de monde
-- ============================================================

-- ── 1. Table world_invitations ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.world_invitations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    UUID        NOT NULL REFERENCES public.worlds(id)  ON DELETE CASCADE,
  invitee_id  UUID        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  inviter_id  UUID                    REFERENCES auth.users(id)  ON DELETE SET NULL,
  role        TEXT        NOT NULL DEFAULT 'player',
  status      TEXT        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (world_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS world_invitations_invitee_idx
  ON public.world_invitations (invitee_id, created_at DESC);

ALTER TABLE public.world_invitations ENABLE ROW LEVEL SECURITY;

-- L'invité et l'inviteur peuvent lire
CREATE POLICY "world_invitations: read own"
  ON public.world_invitations FOR SELECT
  USING (invitee_id = auth.uid() OR inviter_id = auth.uid());

-- L'invité peut accepter/refuser
CREATE POLICY "world_invitations: update own"
  ON public.world_invitations FOR UPDATE
  USING (invitee_id = auth.uid());

-- Tout utilisateur authentifié peut créer une invitation (RLS du monde fait foi)
CREATE POLICY "world_invitations: insert"
  ON public.world_invitations FOR INSERT
  WITH CHECK (inviter_id = auth.uid());

-- ── 2. Ajouter world_invite au CHECK de notifications.type ───
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('mention', 'reaction', 'new_member', 'new_chatroom', 'world_invite'));

-- ── 3. Realtime ──────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.world_invitations;
