-- ============================================================
-- Migration 118 — RPC : personas jouées par membre d'un monde
-- ============================================================
-- L'onglet « Membres » (WorldMembersPanel / WorldMembersSheet, code dupliqué)
-- déduisait les personas utilisées par chaque membre en ramenant jusqu'à
-- **2000 lignes de `chat_messages`** avec la persona jointe, puis en
-- dédupliquant en JavaScript. Sur un monde actif c'est plusieurs centaines de
-- Ko transférés pour en extraire quelques dizaines de couples (membre, persona).
--
-- Le `.limit(2000)` posait en plus un problème de justesse : passé ce seuil, la
-- troncature est silencieuse et arbitraire (aucun ORDER BY), donc les personas
-- des membres les moins récents disparaissaient de la liste sans prévenir.
--
-- Le `DISTINCT ON` fait le travail côté Postgres et ne renvoie que le résultat.
-- Mesuré sur un monde réel : 484 lignes lues → 37 lignes renvoyées.
--
-- SECURITY INVOKER (par défaut) : la RLS de `chat_messages` et de `personas`
-- s'applique au rôle appelant, exactement comme pour la requête client qu'elle
-- remplace. Aucune donnée n'est rendue visible à qui ne la voyait pas déjà.

CREATE OR REPLACE FUNCTION public.get_world_member_personas(p_world_id uuid)
RETURNS TABLE (
  user_id    uuid,
  persona_id uuid,
  name       text,
  avatar_url text
)
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT DISTINCT ON (m.author_id, m.persona_id)
         m.author_id, p.id, p.name, p.avatar_url
  FROM chat_messages m
  JOIN personas p ON p.id = m.persona_id
  WHERE m.world_id = p_world_id
    AND m.persona_id IS NOT NULL
    AND m.author_id IS NOT NULL
  ORDER BY m.author_id, m.persona_id;
$$;

COMMENT ON FUNCTION public.get_world_member_personas(uuid) IS
  'Couples distincts (membre, persona jouée) d''un monde, dérivés de chat_messages. Remplace un chargement client de 2000 messages.';

-- Sert exactement le prédicat de la fonction et rend le DISTINCT ON index-only.
-- `idx_chat_messages_world_created` (world_id, created_at) ne couvre pas le tri
-- par (author_id, persona_id) qu'impose la déduplication. Partiel : les messages
-- sans persona (narration hors personnage) sont exclus de l'index.
CREATE INDEX IF NOT EXISTS idx_chat_messages_world_author_persona
  ON public.chat_messages (world_id, author_id, persona_id)
  WHERE persona_id IS NOT NULL;

-- ── ROLLBACK ─────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.idx_chat_messages_world_author_persona;
-- DROP FUNCTION IF EXISTS public.get_world_member_personas(uuid);
