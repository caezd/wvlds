-- ============================================================
-- Migration 180 — Le statut narratif d'un persona
-- ============================================================
-- Un persona vit, disparaît, meurt ou se retire : rien ne le disait jusqu'ici.
-- Un statut narratif, réglé par son joueur, s'affiche partout où le persona
-- paraît (liste, fiche, en-tête de message, canevas des relations) sans rien
-- interdire : un mort peut encore parler dans un souvenir.
--
-- Au passage : `personas` portait encore une politique `FOR ALL` « owner
-- modify » en plus des quatre politiques par action qui disent la même chose
-- (la 169 ne l'avait pas touchée). Elle part.
--
-- La RPC `get_world_member_personas` (118) rend le statut avec le nom et
-- l'avatar : le panneau des membres grise les personas retirés.

ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS narrative_status text NOT NULL DEFAULT 'alive';
ALTER TABLE public.personas
  ADD CONSTRAINT personas_narrative_status_check
  CHECK (narrative_status IN ('alive', 'missing', 'dead', 'retired'));

DROP POLICY IF EXISTS "personas: owner modify" ON public.personas;

DROP FUNCTION IF EXISTS public.get_world_member_personas(uuid);
CREATE OR REPLACE FUNCTION public.get_world_member_personas(p_world_id uuid)
RETURNS TABLE (
  user_id          uuid,
  persona_id       uuid,
  name             text,
  avatar_url       text,
  narrative_status text
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (m.author_id, m.persona_id)
         m.author_id, p.id, p.name, p.avatar_url, p.narrative_status
  FROM public.chat_messages m
  JOIN public.personas p ON p.id = m.persona_id
  WHERE m.world_id = p_world_id
    AND m.persona_id IS NOT NULL
    AND m.author_id IS NOT NULL
    AND p.deleted_at IS NULL
  ORDER BY m.author_id, m.persona_id;
$$;
REVOKE ALL ON FUNCTION public.get_world_member_personas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_world_member_personas(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_world_member_personas(uuid) IS
  'Couples distincts (membre, persona jouée) d''un monde, dérivés de chat_messages, avec le statut narratif du persona.';

-- ── VÉRIFICATION ─────────────────────────────────────────────
-- SELECT narrative_status, count(*) FROM public.personas GROUP BY 1;   -- → alive : tous
-- SELECT count(*) FROM pg_policies WHERE tablename='personas';         -- → 6 (2 select, insert, update, delete… sans le FOR ALL)

-- ── ROLLBACK ─────────────────────────────────────────────────
-- ALTER TABLE public.personas DROP COLUMN narrative_status ; rejouer la RPC de la 118.
