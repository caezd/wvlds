-- ============================================================
-- Migration 002 — Rôle admin sur profiles + tables boutique
-- ============================================================


-- ── 1. Rôle admin sur profiles ───────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Pour accorder le rôle à un utilisateur :
--   UPDATE public.profiles SET is_admin = true WHERE id = '<user-uuid>';


-- ── 2. cosmetic_items — articles disponibles en boutique ─────
CREATE TABLE IF NOT EXISTS public.cosmetic_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT        NOT NULL UNIQUE,
  name         TEXT        NOT NULL,
  slot         TEXT        NOT NULL DEFAULT 'avatar_frame',
  price_coins  INTEGER     NOT NULL DEFAULT 0 CHECK (price_coins >= 0),
  asset_url    TEXT        NOT NULL DEFAULT '',
  preview_url  TEXT,
  active       BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cosmetic_items ENABLE ROW LEVEL SECURITY;

-- Lecture publique (tous les utilisateurs connectés voient les articles actifs)
CREATE POLICY "cosmetic_items: read active"
  ON public.cosmetic_items FOR SELECT
  USING (active = true OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ));

-- Écriture réservée aux admins
CREATE POLICY "cosmetic_items: admin write"
  ON public.cosmetic_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ));


-- ── 3. gamification_balances — solde coins/XP par utilisateur ─
CREATE TABLE IF NOT EXISTS public.gamification_balances (
  user_id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  coins           INTEGER     NOT NULL DEFAULT 0 CHECK (coins >= 0),
  xp              INTEGER     NOT NULL DEFAULT 0 CHECK (xp >= 0),
  streak_current  INTEGER     NOT NULL DEFAULT 0,
  streak_longest  INTEGER     NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gamification_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gamification_balances: owner read"
  ON public.gamification_balances FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "gamification_balances: owner update"
  ON public.gamification_balances FOR UPDATE
  USING (user_id = auth.uid());

-- Initialiser la balance à 0 pour les nouveaux utilisateurs (trigger ou manuel)


-- ── 4. user_owned_cosmetics — articles achetés ───────────────
CREATE TABLE IF NOT EXISTS public.user_owned_cosmetics (
  user_id      UUID        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  item_id      UUID        NOT NULL REFERENCES public.cosmetic_items(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

ALTER TABLE public.user_owned_cosmetics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_owned_cosmetics: owner read"
  ON public.user_owned_cosmetics FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "user_owned_cosmetics: admin read"
  ON public.user_owned_cosmetics FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.is_admin = true
  ));


-- ── 5. user_equipped_cosmetics — article équipé par slot ─────
CREATE TABLE IF NOT EXISTS public.user_equipped_cosmetics (
  user_id         UUID  NOT NULL REFERENCES auth.users(id)            ON DELETE CASCADE,
  avatar_frame_id UUID           REFERENCES public.cosmetic_items(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id)
);

ALTER TABLE public.user_equipped_cosmetics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_equipped_cosmetics: owner full"
  ON public.user_equipped_cosmetics FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_equipped_cosmetics: read all"
  ON public.user_equipped_cosmetics FOR SELECT
  USING (true);  -- les autres peuvent voir le cadre (pour l'afficher dans le chat)


-- ── 6. RPC shop_list_items ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.shop_list_items()
RETURNS TABLE (
  id           UUID,
  key          TEXT,
  name         TEXT,
  slot         TEXT,
  price_coins  INTEGER,
  asset_url    TEXT,
  preview_url  TEXT,
  active       BOOLEAN,
  owned        BOOLEAN,
  can_afford   BOOLEAN,
  equipped     BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    ci.id,
    ci.key,
    ci.name,
    ci.slot,
    ci.price_coins,
    ci.asset_url,
    ci.preview_url,
    ci.active,
    EXISTS (
      SELECT 1 FROM public.user_owned_cosmetics uo
      WHERE uo.item_id = ci.id AND uo.user_id = auth.uid()
    ) AS owned,
    COALESCE((
      SELECT gb.coins >= ci.price_coins
      FROM public.gamification_balances gb
      WHERE gb.user_id = auth.uid()
    ), false) AS can_afford,
    COALESCE((
      SELECT uec.avatar_frame_id = ci.id
      FROM public.user_equipped_cosmetics uec
      WHERE uec.user_id = auth.uid()
    ), false) AS equipped
  FROM public.cosmetic_items ci
  WHERE ci.active = true
  ORDER BY ci.slot, ci.name;
$$;


-- ── 7. RPC shop_purchase ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.shop_purchase(p_item_key TEXT, p_equip BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item      public.cosmetic_items;
  v_balance   public.gamification_balances;
  v_uid       UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Non authentifié');
  END IF;

  SELECT * INTO v_item FROM public.cosmetic_items WHERE key = p_item_key AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Article introuvable');
  END IF;

  -- Déjà possédé ?
  IF EXISTS (SELECT 1 FROM public.user_owned_cosmetics WHERE user_id = v_uid AND item_id = v_item.id) THEN
    IF p_equip THEN
      INSERT INTO public.user_equipped_cosmetics (user_id, avatar_frame_id)
      VALUES (v_uid, v_item.id)
      ON CONFLICT (user_id) DO UPDATE SET avatar_frame_id = v_item.id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'already_owned', true);
  END IF;

  -- Vérifier le solde
  SELECT * INTO v_balance FROM public.gamification_balances WHERE user_id = v_uid;
  IF NOT FOUND OR v_balance.coins < v_item.price_coins THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solde insuffisant');
  END IF;

  -- Déduire les coins
  UPDATE public.gamification_balances
  SET coins = coins - v_item.price_coins, updated_at = now()
  WHERE user_id = v_uid;

  -- Ajouter à l'inventaire
  INSERT INTO public.user_owned_cosmetics (user_id, item_id)
  VALUES (v_uid, v_item.id)
  ON CONFLICT DO NOTHING;

  -- Équiper si demandé
  IF p_equip THEN
    INSERT INTO public.user_equipped_cosmetics (user_id, avatar_frame_id)
    VALUES (v_uid, v_item.id)
    ON CONFLICT (user_id) DO UPDATE SET avatar_frame_id = v_item.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'coins_spent', v_item.price_coins);
END;
$$;


-- ── 8. RPC shop_equip / shop_unequip ─────────────────────────
CREATE OR REPLACE FUNCTION public.shop_equip(p_item_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item public.cosmetic_items;
  v_uid  UUID := auth.uid();
BEGIN
  SELECT * INTO v_item FROM public.cosmetic_items WHERE key = p_item_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Article introuvable'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_owned_cosmetics WHERE user_id = v_uid AND item_id = v_item.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Article non possédé');
  END IF;
  INSERT INTO public.user_equipped_cosmetics (user_id, avatar_frame_id)
  VALUES (v_uid, v_item.id)
  ON CONFLICT (user_id) DO UPDATE SET avatar_frame_id = v_item.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.shop_unequip(p_slot TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF p_slot = 'avatar_frame' THEN
    UPDATE public.user_equipped_cosmetics SET avatar_frame_id = NULL WHERE user_id = v_uid;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ── Index ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cosmetic_items_slot   ON public.cosmetic_items (slot);
CREATE INDEX IF NOT EXISTS idx_cosmetic_items_active ON public.cosmetic_items (active);
CREATE INDEX IF NOT EXISTS idx_user_owned_user_id    ON public.user_owned_cosmetics (user_id);
