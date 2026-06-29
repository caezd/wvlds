-- ============================================================
-- Migration 046 — Lecture publique des victoires + RPC journal
-- ============================================================


-- ── 1. Politique : toute victoire est visible par les membres authentifiés ──
-- Les échecs (status='failed') restent privés (couverts par owner read de 044).
CREATE POLICY "challenge_attempts: read won"
  ON public.challenge_attempts FOR SELECT
  USING (status = 'won');


-- ── 2. RPC get_daily_challenge_journal ────────────────────────
-- Retourne les victoires du jour (ou d'une date donnée) avec profil + chatroom.
-- SECURITY DEFINER pour bypasser les RLS et joindre librement les tables.
CREATE OR REPLACE FUNCTION public.get_daily_challenge_journal(
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  challenge_id    UUID,
  challenge_title TEXT,
  user_id         UUID,
  username        TEXT,
  avatar_url      TEXT,
  chat_id         UUID,
  chatroom_title  TEXT,
  won_at          TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.id                AS challenge_id,
    c.title             AS challenge_title,
    p.id                AS user_id,
    p.username          AS username,
    p.avatar_url        AS avatar_url,
    ca.chat_id          AS chat_id,
    ch.title            AS chatroom_title,
    ca.created_at       AS won_at
  FROM public.challenge_attempts ca
  JOIN public.challenges   c  ON c.id  = ca.challenge_id
  JOIN public.profiles     p  ON p.id  = ca.user_id
  LEFT JOIN public.chatrooms ch ON ch.id = ca.chat_id
  WHERE c.active_date = p_date
    AND ca.status = 'won'
  ORDER BY ca.created_at DESC;
$$;
