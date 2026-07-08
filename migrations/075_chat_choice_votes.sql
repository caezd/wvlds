-- ============================================================
-- Migration 075 — Votes sur les blocs « choix »
-- ============================================================
-- Table dédiée aux votes du nouveau bloc de message "choice" (sondage à
-- cartes). Calquée sur chat_message_reactions (001_missing_tables.sql) et
-- son correctif d'accès membre (061_allow_viewer_reactions.sql) : n'importe
-- quel membre du monde peut voter, sa ligne est visible de tous, un revote
-- met simplement à jour sa ligne (clé primaire (message_id, user_id) au lieu
-- d'un UNIQUE sur emoji comme les réactions, puisqu'un seul choix est permis
-- à la fois). L'auteur du message ne peut pas voter sur son propre choix —
-- contrainte imposée ici (RLS) en plus du client, pas uniquement côté écran.

CREATE TABLE IF NOT EXISTS public.chat_choice_votes (
  message_id  BIGINT      NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  chat_id     UUID        NOT NULL,  -- dénormalisé pour le filtre Realtime, comme chat_message_reactions
  option_id   TEXT        NOT NULL,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

ALTER TABLE public.chat_choice_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "choice_votes: read all"
  ON public.chat_choice_votes
  FOR SELECT USING (true);

CREATE POLICY "choice_votes: insert own (member, not author)"
  ON public.chat_choice_votes
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.chatrooms c
      JOIN public.world_members wm ON wm.world_id = c.world_id
      WHERE c.id = chat_choice_votes.chat_id
        AND wm.user_id = (SELECT auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = chat_choice_votes.message_id
        AND m.author_id = (SELECT auth.uid())
    )
  );

-- Revote : même garde que l'insertion (appartenance + pas l'auteur).
CREATE POLICY "choice_votes: update own (member, not author)"
  ON public.chat_choice_votes
  FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.chatrooms c
      JOIN public.world_members wm ON wm.world_id = c.world_id
      WHERE c.id = chat_choice_votes.chat_id
        AND wm.user_id = (SELECT auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = chat_choice_votes.message_id
        AND m.author_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "choice_votes: delete own"
  ON public.chat_choice_votes
  FOR DELETE USING (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_chat_choice_votes_message_id
  ON public.chat_choice_votes (message_id);

CREATE INDEX IF NOT EXISTS idx_chat_choice_votes_chat_id
  ON public.chat_choice_votes (chat_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_choice_votes;

-- Nécessaire pour que payload.old contienne option_id sur UPDATE/DELETE en
-- Realtime (par défaut, seule la clé primaire (message_id, user_id) y figure,
-- ce qui empêcherait de détecter vers/depuis quelle option un revote a eu lieu).
ALTER TABLE public.chat_choice_votes REPLICA IDENTITY FULL;
