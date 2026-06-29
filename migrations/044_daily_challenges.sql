-- ============================================================
-- Migration 044 — Défis quotidiens
-- ============================================================


-- ── 1. challenges ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenges (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id        UUID        REFERENCES public.worlds(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  description     TEXT,
  validation      JSONB       NOT NULL,
  reward_coins    INTEGER     NOT NULL DEFAULT 10 CHECK (reward_coins >= 0),
  reward_xp       INTEGER     NOT NULL DEFAULT 5  CHECK (reward_xp >= 0),
  min_word_count  INTEGER     NOT NULL DEFAULT 20 CHECK (min_word_count >= 0),
  active_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  source          TEXT        NOT NULL DEFAULT 'admin'
                              CHECK (source IN ('word_of_day', 'admin')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenges: member read"
  ON public.challenges FOR SELECT
  USING (
    world_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.world_members wm
      WHERE wm.world_id = challenges.world_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "challenges: admin write"
  ON public.challenges FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ));

-- Empêche les doublons word_of_day global par jour
CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_word_of_day_unique
  ON public.challenges (active_date)
  WHERE source = 'word_of_day' AND world_id IS NULL;


-- ── 2. challenge_attempts ──────────────────────────────────────
-- 'won'    : défi relevé avec succès (chat_id + message_id obligatoires)
-- 'failed' : défi expiré sans tentative réussie (chat_id + message_id NULL)
CREATE TABLE IF NOT EXISTS public.challenge_attempts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id    UUID        NOT NULL REFERENCES public.challenges(id)    ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id)           ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'won'
                              CHECK (status IN ('won', 'failed')),
  chat_id         UUID        REFERENCES public.chatrooms(id)              ON DELETE CASCADE,
  message_id      BIGINT      REFERENCES public.chat_messages(id)          ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id),
  -- Les tentatives gagnées doivent avoir une preuve
  CONSTRAINT won_requires_proof
    CHECK (status = 'failed' OR (chat_id IS NOT NULL AND message_id IS NOT NULL))
);

ALTER TABLE public.challenge_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenge_attempts: owner read"
  ON public.challenge_attempts FOR SELECT
  USING (user_id = auth.uid());

-- Seule la RPC claim_challenge_attempt (SECURITY DEFINER) peut insérer
CREATE POLICY "challenge_attempts: deny direct insert"
  ON public.challenge_attempts FOR INSERT
  WITH CHECK (false);


-- ── 3. RPC get_active_daily_challenges ────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_daily_challenges(p_world_id UUID)
RETURNS TABLE (
  id              UUID,
  title           TEXT,
  description     TEXT,
  validation      JSONB,
  reward_coins    INTEGER,
  reward_xp       INTEGER,
  min_word_count  INTEGER,
  source          TEXT,
  already_won     BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.title,
    c.description,
    c.validation,
    c.reward_coins,
    c.reward_xp,
    c.min_word_count,
    c.source,
    EXISTS (
      SELECT 1 FROM public.challenge_attempts ca
      WHERE ca.challenge_id = c.id
        AND ca.user_id = auth.uid()
        AND ca.status = 'won'
    ) AS already_won
  FROM public.challenges c
  WHERE
    c.active_date = CURRENT_DATE
    AND (c.world_id IS NULL OR c.world_id = p_world_id)
  ORDER BY c.source DESC, c.created_at;
$$;


-- ── 4. RPC claim_challenge_attempt ────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_challenge_attempt(
  p_challenge_id UUID,
  p_message_id   BIGINT,
  p_chat_id      UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_challenge public.challenges;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Non authentifié');
  END IF;

  SELECT * INTO v_challenge
  FROM public.challenges
  WHERE id = p_challenge_id AND active_date = CURRENT_DATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Défi introuvable ou expiré');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.challenge_attempts
    WHERE challenge_id = p_challenge_id AND user_id = v_uid AND status = 'won'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Défi déjà relevé');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chat_messages
    WHERE id = p_message_id AND author_id = v_uid AND chat_id = p_chat_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Message invalide');
  END IF;

  -- Remplace un éventuel 'failed' antérieur (cas où la RLS aurait laissé passer)
  INSERT INTO public.challenge_attempts (challenge_id, user_id, status, chat_id, message_id)
  VALUES (p_challenge_id, v_uid, 'won', p_chat_id, p_message_id)
  ON CONFLICT (challenge_id, user_id) DO UPDATE
    SET status     = 'won',
        chat_id    = EXCLUDED.chat_id,
        message_id = EXCLUDED.message_id;

  INSERT INTO public.gamification_balances (user_id, coins, xp)
  VALUES (v_uid, v_challenge.reward_coins, v_challenge.reward_xp)
  ON CONFLICT (user_id) DO UPDATE
    SET coins      = gamification_balances.coins + v_challenge.reward_coins,
        xp         = gamification_balances.xp    + v_challenge.reward_xp,
        updated_at = now();

  RETURN jsonb_build_object(
    'ok',    true,
    'coins', v_challenge.reward_coins,
    'xp',    v_challenge.reward_xp
  );
END;
$$;


-- ── 5. RPC expire_daily_challenges ────────────────────────────
-- Appelée par l'Edge Function chaque matin avant de créer la nouvelle quête.
-- Enregistre 'failed' pour les membres d'un monde qui n'ont pas gagné hier.
-- Les défis globaux (world_id IS NULL) ne génèrent pas de lignes failed
-- (trop d'utilisateurs potentiels ; l'UI déduit l'échec depuis active_date).
CREATE OR REPLACE FUNCTION public.expire_daily_challenges(p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.challenge_attempts (challenge_id, user_id, status)
  SELECT c.id, wm.user_id, 'failed'
  FROM public.challenges c
  JOIN public.world_members wm ON wm.world_id = c.world_id
  WHERE
    c.active_date  = p_date
    AND c.world_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.challenge_attempts ca
      WHERE ca.challenge_id = c.id AND ca.user_id = wm.user_id
    )
  ON CONFLICT (challenge_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ── 6. Index ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_challenges_active_date   ON public.challenges (active_date);
CREATE INDEX IF NOT EXISTS idx_challenges_world_id      ON public.challenges (world_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user_id         ON public.challenge_attempts (user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_challenge_id    ON public.challenge_attempts (challenge_id);
