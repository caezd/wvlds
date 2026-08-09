-- Blocage d'utilisateur pour la messagerie privée.
-- Tout compte peut aujourd'hui ouvrir une DM avec n'importe quel autre compte
-- de la plateforme (recherche globale), sans recours pour la cible. `user_blocks`
-- ajoute un blocage unilatéral qui :
--   - empêche l'ouverture d'une NOUVELLE conversation (find_or_create_dm) ;
--   - empêche l'envoi de nouveaux messages dans une conversation existante
--     (policy dm_messages_insert), dans les deux sens ;
--   - retire l'autre personne des résultats de recherche (search_dm_users).
-- L'historique déjà échangé reste lisible (pas de suppression rétroactive) et
-- une conversation déjà ouverte reste réouvrable en lecture — seul l'envoi est
-- coupé, pour ne pas faire disparaître l'historique de la personne bloquée.

CREATE TABLE user_blocks (
  blocker_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX user_blocks_blocked_id_idx ON user_blocks (blocked_id);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Un utilisateur ne voit que sa propre liste de blocages (pas celle des autres,
-- pas si on l'a bloqué).
CREATE POLICY "user_blocks_select" ON user_blocks
  FOR SELECT USING (blocker_id = (SELECT auth.uid()));

CREATE POLICY "user_blocks_insert" ON user_blocks
  FOR INSERT WITH CHECK (blocker_id = (SELECT auth.uid()));

CREATE POLICY "user_blocks_delete" ON user_blocks
  FOR DELETE USING (blocker_id = (SELECT auth.uid()));

REVOKE ALL ON public.user_blocks FROM anon;

-- ── RPC : bloquer / débloquer ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION block_user(p_blocked_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_blocked_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Cannot block yourself';
  END IF;

  INSERT INTO user_blocks (blocker_id, blocked_id)
  VALUES ((SELECT auth.uid()), p_blocked_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION unblock_user(p_blocked_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM user_blocks
  WHERE blocker_id = (SELECT auth.uid()) AND blocked_id = p_blocked_id;
END;
$$;

REVOKE ALL ON FUNCTION public.unblock_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;

-- ── find_or_create_dm : bloque la création, pas la réouverture ──────────────
-- On resélectionne d'abord une conversation existante : si elle existe déjà
-- (échanges passés avant le blocage), elle reste réouvrable en lecture. Le
-- blocage n'empêche que la CRÉATION d'une conversation inédite.

CREATE OR REPLACE FUNCTION find_or_create_dm(p_other_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := (SELECT auth.uid());
  v_a  uuid;
  v_b  uuid;
  v_id uuid;
BEGIN
  IF v_me = p_other_user_id THEN
    RAISE EXCEPTION 'Cannot open a DM with yourself';
  END IF;

  IF v_me < p_other_user_id THEN
    v_a := v_me; v_b := p_other_user_id;
  ELSE
    v_a := p_other_user_id; v_b := v_me;
  END IF;

  SELECT id INTO v_id FROM dm_conversations
  WHERE participant_a = v_a AND participant_b = v_b;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = v_me AND blocked_id = p_other_user_id)
       OR (blocker_id = p_other_user_id AND blocked_id = v_me)
  ) THEN
    RAISE EXCEPTION 'Cannot start a DM with a blocked user';
  END IF;

  -- INSERT ... ON CONFLICT DO NOTHING puis SELECT : garantit l'atomicité en
  -- cas d'appels concurrents (cf. migration 042).
  INSERT INTO dm_conversations (participant_a, participant_b)
  VALUES (v_a, v_b)
  ON CONFLICT (participant_a, participant_b) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM dm_conversations
    WHERE participant_a = v_a AND participant_b = v_b;
  END IF;

  RETURN v_id;
END;
$$;

-- ── dm_messages_insert : coupe l'envoi si un blocage existe entre les deux ──

DROP POLICY "dm_messages_insert" ON dm_messages;

CREATE POLICY "dm_messages_insert" ON dm_messages
  FOR INSERT WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM dm_conversations c
      WHERE c.id = conversation_id
        AND (c.participant_a = (SELECT auth.uid()) OR c.participant_b = (SELECT auth.uid()))
    )
    AND NOT EXISTS (
      SELECT 1 FROM dm_conversations c
      JOIN user_blocks ub
        ON (ub.blocker_id = c.participant_a AND ub.blocked_id = c.participant_b)
        OR (ub.blocker_id = c.participant_b AND ub.blocked_id = c.participant_a)
      WHERE c.id = conversation_id
    )
  );

-- ── RPC : recherche d'utilisateurs pour démarrer une DM ──────────────────────
-- Remplace la requête client directe sur `profiles` : exclut désormais
-- systématiquement soi-même et tout utilisateur bloqué dans un sens ou l'autre.

CREATE OR REPLACE FUNCTION search_dm_users(p_query text)
RETURNS TABLE (id uuid, username text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.avatar_url
  FROM profiles p
  WHERE p.id <> (SELECT auth.uid())
    AND p.username ILIKE '%' || p_query || '%'
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = (SELECT auth.uid()) AND ub.blocked_id = p.id)
         OR (ub.blocker_id = p.id AND ub.blocked_id = (SELECT auth.uid()))
    )
  ORDER BY p.username
  LIMIT 8;
$$;

REVOKE ALL ON FUNCTION public.search_dm_users(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_dm_users(text) TO authenticated;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.search_dm_users(text);
-- DROP FUNCTION IF EXISTS public.block_user(uuid);
-- DROP FUNCTION IF EXISTS public.unblock_user(uuid);
-- DROP TABLE IF EXISTS public.user_blocks;
-- (recréer find_or_create_dm et dm_messages_insert depuis la migration 100/041)
