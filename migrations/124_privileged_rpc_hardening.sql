-- ============================================================
-- Migration 124 — Durcissement de trois RPC privilégiées
-- ============================================================
-- Suite du balayage des fonctions `SECURITY DEFINER` : elles s'exécutent avec
-- les droits de leur propriétaire, donc hors RLS. Chacune doit porter
-- elle-même son contrôle d'accès et sa cohérence. Trois manquaient.

-- ── 1. `expire_daily_challenges` : aucune autorisation ───────
-- Cette fonction marque « échoué » le défi du jour pour TOUS les membres de
-- TOUS les mondes. C'est une tâche de maintenance, appelée uniquement par la
-- fonction edge `generate-daily-challenge`, qui s'authentifie avec la clé de
-- service. Elle était pourtant exécutable par `authenticated` ET par `anon` :
-- n'importe qui, même sans compte, pouvait faire échouer d'un coup les défis
-- du jour de l'ensemble des joueurs, autant de fois qu'il le souhaitait.
--
-- On retire le droit d'exécution aux rôles clients ; `service_role` le
-- conserve explicitement, donc la tâche planifiée n'est pas touchée.
--
-- Attention au premier réflexe, qui ne suffit pas : Postgres accorde EXECUTE
-- à PUBLIC par défaut sur toute fonction. Révoquer auprès d'`anon` et
-- d'`authenticated` seulement les laisse hériter du droit via PUBLIC — la
-- vérification le montrait encore à `true` après coup. Il faut retirer à
-- PUBLIC, puis re-accorder aux seuls rôles légitimes.
REVOKE EXECUTE ON FUNCTION public.expire_daily_challenges(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_daily_challenges(date) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_daily_challenges(date) TO service_role;

-- ── 2. `shop_purchase` : dépense concurrente ─────────────────
-- La vérification du solde et le débit étaient deux instructions séparées :
--
--   SELECT ... INTO v_balance ...          -- lit 10 pièces
--   IF v_balance.coins < prix THEN ...     -- passe
--   UPDATE ... SET coins = coins - prix    -- débite
--
-- Deux achats simultanés lisent tous deux 10, passent tous deux le contrôle,
-- puis débitent l'un après l'autre. En READ COMMITTED, le second `UPDATE`
-- attend le verrou puis réévalue `coins - prix` sur la valeur À JOUR : le
-- solde tombe à -10 et les deux articles sont acquis.
--
-- Le contrôle passe donc dans le `WHERE` de l'`UPDATE`, où il est réévalué
-- après l'obtention du verrou. Zéro ligne modifiée = solde insuffisant.
CREATE OR REPLACE FUNCTION public.shop_purchase(p_item_key text, p_equip boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_item    public.cosmetic_items;
  v_uid     UUID := auth.uid();
  v_debited INTEGER;
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

  -- Contrôle du solde ET débit en une seule instruction : le `WHERE` est
  -- réévalué après le verrou de ligne, donc deux achats simultanés ne peuvent
  -- plus passer tous les deux.
  UPDATE public.gamification_balances
  SET coins = coins - v_item.price_coins
  WHERE user_id = v_uid
    AND coins >= v_item.price_coins;

  GET DIAGNOSTICS v_debited = ROW_COUNT;
  IF v_debited = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solde insuffisant');
  END IF;

  INSERT INTO public.user_owned_cosmetics (user_id, item_id)
  VALUES (v_uid, v_item.id)
  ON CONFLICT DO NOTHING;

  IF p_equip THEN
    INSERT INTO public.user_equipped_cosmetics (user_id, avatar_frame_id)
    VALUES (v_uid, v_item.id)
    ON CONFLICT (user_id) DO UPDATE SET avatar_frame_id = v_item.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'coins_spent', v_item.price_coins);
END;
$function$;

-- ── 3. `claim_challenge_attempt` : récompense doublée ────────
-- Même schéma : le contrôle « défi déjà relevé » était un `SELECT` séparé, et
-- le crédit d'XP et de pièces s'appliquait ensuite sans condition. Deux appels
-- simultanés passaient tous deux le contrôle, l'`ON CONFLICT` fusionnait bien
-- la tentative en une seule ligne — mais la récompense était créditée deux
-- fois.
--
-- Le crédit est désormais conditionné à la transition réelle vers « won » :
-- le `WHERE` de la clause `DO UPDATE` ne laisse passer qu'une seule des deux
-- exécutions, et `RETURNING` ne rend une ligne qu'à celle-là.
CREATE OR REPLACE FUNCTION public.claim_challenge_attempt(
  p_challenge_id uuid,
  p_message_id bigint,
  p_chat_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_uid       UUID := auth.uid();
  v_challenge public.challenges;
  v_granted   INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Non authentifié');
  END IF;

  SELECT * INTO v_challenge
  FROM public.challenges
  WHERE id = p_challenge_id
    AND active_date = CURRENT_DATE
    AND (user_id IS NULL OR user_id = v_uid);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Défi introuvable ou expiré');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chat_messages
    WHERE id = p_message_id AND author_id = v_uid AND chat_id = p_chat_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Message invalide');
  END IF;

  INSERT INTO public.challenge_attempts (challenge_id, user_id, status, chat_id, message_id)
  VALUES (p_challenge_id, v_uid, 'won', p_chat_id, p_message_id)
  ON CONFLICT (challenge_id, user_id) DO UPDATE
    SET status     = 'won',
        chat_id    = EXCLUDED.chat_id,
        message_id = EXCLUDED.message_id
    WHERE public.challenge_attempts.status <> 'won'
  RETURNING 1 INTO v_granted;

  -- Aucune ligne rendue : le défi était déjà relevé (ou l'a été à l'instant
  -- par un appel concurrent). Pas de seconde récompense.
  IF v_granted IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Défi déjà relevé');
  END IF;

  INSERT INTO public.gamification_balances (user_id, coins, xp)
  VALUES (v_uid, v_challenge.reward_coins, v_challenge.reward_xp)
  ON CONFLICT (user_id) DO UPDATE
    SET coins = gamification_balances.coins + v_challenge.reward_coins,
        xp    = gamification_balances.xp    + v_challenge.reward_xp;

  RETURN jsonb_build_object(
    'ok',    true,
    'coins', v_challenge.reward_coins,
    'xp',    v_challenge.reward_xp
  );
END;
$function$;

-- ── Revues sans suite ────────────────────────────────────────
-- Trois autres fonctions du même groupe ont été relues sans qu'il y ait lieu
-- d'intervenir, pour mémoire :
--   `join_public_world`     — vérifie `visibility='public'`, impose le rôle
--                             'player', gère la restriction d'âge.
--   `confirm_world_age`     — exige d'être membre, n'écrit que sa propre
--                             ligne, et seulement si elle est encore vide.
--   `accept_world_invitation` — corrigée en migration 122.

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT has_function_privilege('anon',          'public.expire_daily_challenges(date)', 'EXECUTE');
-- SELECT has_function_privilege('authenticated', 'public.expire_daily_challenges(date)', 'EXECUTE');
-- SELECT has_function_privilege('service_role',  'public.expire_daily_challenges(date)', 'EXECUTE');
--   → false, false, true
--
-- Achat au-delà du solde : `shop_purchase` doit renvoyer « Solde insuffisant »
-- et laisser le solde inchangé (jamais négatif).

-- ── ROLLBACK ─────────────────────────────────────────────────
-- GRANT EXECUTE ON FUNCTION public.expire_daily_challenges(date) TO PUBLIC;
-- (et réappliquer les définitions précédentes des deux fonctions, identiques
--  à celles-ci moins les contrôles décrits ci-dessus)
