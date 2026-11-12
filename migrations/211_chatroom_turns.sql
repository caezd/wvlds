-- 211 — Ordre de passage dans un salon.
--
-- Le créateur du salon, ou qui a « Gérer les salons », active l'ordre et range
-- les joueurs. Le tour passe au suivant dès que le joueur dont c'est le tour
-- poste un message public (pas une note privée). Informatif : poster hors tour
-- reste possible, rien ne le bloque.
--
-- Une ligne par salon ; `order_user_ids` liste les joueurs (comptes, pas
-- personas : un joueur joue souvent plusieurs personas dans une scène),
-- `current_index` (0-based) désigne celui dont c'est le tour.

CREATE TABLE IF NOT EXISTS public.chatroom_turns (
  chat_id        uuid        PRIMARY KEY REFERENCES public.chatrooms(id) ON DELETE CASCADE,
  world_id       uuid        NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  enabled        boolean     NOT NULL DEFAULT true,
  order_user_ids uuid[]      NOT NULL DEFAULT '{}' CHECK (cardinality(order_user_ids) <= 50),
  current_index  integer     NOT NULL DEFAULT 0 CHECK (current_index >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chatroom_turns ENABLE ROW LEVEL SECURITY;

-- Qui règle l'ordre d'un salon : son créateur, ou qui gère les salons du monde.
CREATE OR REPLACE FUNCTION public.can_manage_chatroom_turns(p_chat_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chatrooms c
    WHERE c.id = p_chat_id
      AND c.world_id IS NOT NULL
      AND public.is_world_member(c.world_id, p_uid)
      AND (c.created_by = p_uid OR public.has_world_permission(c.world_id, p_uid, 'chatrooms.manage'))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_chatroom_turns(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_chatroom_turns(uuid, uuid) TO authenticated;

-- Le monde vient du salon ; l'index reste dans les bornes de la liste.
CREATE OR REPLACE FUNCTION public.chatroom_turns_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT c.world_id INTO NEW.world_id FROM public.chatrooms c WHERE c.id = NEW.chat_id;
  IF NEW.world_id IS NULL THEN
    RAISE EXCEPTION 'salon hors monde' USING ERRCODE = '22023';
  END IF;
  IF cardinality(NEW.order_user_ids) = 0 THEN
    NEW.current_index := 0;
  ELSE
    NEW.current_index := NEW.current_index % cardinality(NEW.order_user_ids);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chatroom_turns_normalize ON public.chatroom_turns;
CREATE TRIGGER trg_chatroom_turns_normalize
  BEFORE INSERT OR UPDATE ON public.chatroom_turns
  FOR EACH ROW
  EXECUTE FUNCTION public.chatroom_turns_normalize();

DROP POLICY IF EXISTS chatroom_turns_select ON public.chatroom_turns;
CREATE POLICY chatroom_turns_select ON public.chatroom_turns
  FOR SELECT TO authenticated
  USING (public.is_world_member(world_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS chatroom_turns_insert ON public.chatroom_turns;
CREATE POLICY chatroom_turns_insert ON public.chatroom_turns
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_chatroom_turns(chat_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS chatroom_turns_update ON public.chatroom_turns;
CREATE POLICY chatroom_turns_update ON public.chatroom_turns
  FOR UPDATE TO authenticated
  USING (public.can_manage_chatroom_turns(chat_id, (SELECT auth.uid())))
  WITH CHECK (public.can_manage_chatroom_turns(chat_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS chatroom_turns_delete ON public.chatroom_turns;
CREATE POLICY chatroom_turns_delete ON public.chatroom_turns
  FOR DELETE TO authenticated
  USING (public.can_manage_chatroom_turns(chat_id, (SELECT auth.uid())));

-- Le tour avance quand le joueur courant poste un message public. SECURITY
-- DEFINER : le joueur n'a pas le droit de modifier l'ordre lui-même.
CREATE OR REPLACE FUNCTION public.chatroom_turns_advance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.visible_to IS NOT NULL THEN
    RETURN NULL;
  END IF;
  UPDATE public.chatroom_turns t
     SET current_index = t.current_index + 1
   WHERE t.chat_id = NEW.chat_id
     AND t.enabled
     AND cardinality(t.order_user_ids) > 0
     AND t.order_user_ids[t.current_index + 1] = NEW.author_id;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- L'ordre de passage ne doit jamais empêcher de poster.
  RAISE WARNING 'chatroom_turns_advance : %', SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.chatroom_turns_advance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.chatroom_turns_normalize() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chatroom_turns_advance ON public.chat_messages;
CREATE TRIGGER trg_chatroom_turns_advance
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.chatroom_turns_advance();

-- Le salon diffuse les changements d'ordre en temps réel (canal du salon).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chatroom_turns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chatroom_turns;
  END IF;
END $$;

-- ── RETOUR ARRIÈRE ───────────────────────────────────────────
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.chatroom_turns;
-- DROP TRIGGER IF EXISTS trg_chatroom_turns_advance ON public.chat_messages;
-- DROP FUNCTION IF EXISTS public.chatroom_turns_advance();
-- DROP TABLE IF EXISTS public.chatroom_turns;
-- DROP FUNCTION IF EXISTS public.chatroom_turns_normalize();
-- DROP FUNCTION IF EXISTS public.can_manage_chatroom_turns(uuid, uuid);
