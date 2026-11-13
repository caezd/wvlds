-- ─────────────────────────────────────────────────────────────
-- Migration 199 — Les personas de chaque salon, tenus à jour
--
-- La chronologie (filtre « Persona présent », fil d'un persona) demande
-- quels personas ont écrit dans chaque salon d'un monde. `get_chatroom_personas`
-- (migrations 193, 196) le recalculait à chaque ouverture en parcourant tous
-- les messages du monde. La table `chatroom_persona_authors` en garde la
-- réponse, tenue à jour par un déclencheur sur `chat_messages` : la lecture
-- ne dépend plus du nombre de messages.
--
-- Seuls les messages publics comptent (`visible_to` vide) : un message privé
-- n'est lisible que de ses destinataires, et la table ne doit pas révéler à
-- tout le monde qu'un persona a écrit en aparté. (La fonction, en invoker,
-- laissait voir aux destinataires les personas de leurs apartés ; ce détail
-- se perd, au profit de ne rien laisser fuiter.)
--
-- Lecture : les membres du monde. Écriture : le déclencheur seul.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chatroom_persona_authors (
  chat_id    uuid NOT NULL REFERENCES public.chatrooms(id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES public.personas(id) ON DELETE CASCADE,
  world_id   uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  PRIMARY KEY (chat_id, persona_id)
);

CREATE INDEX IF NOT EXISTS chatroom_persona_authors_world_idx
  ON public.chatroom_persona_authors (world_id);
CREATE INDEX IF NOT EXISTS chatroom_persona_authors_persona_idx
  ON public.chatroom_persona_authors (persona_id);

ALTER TABLE public.chatroom_persona_authors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chatroom_persona_authors_select ON public.chatroom_persona_authors;
CREATE POLICY chatroom_persona_authors_select ON public.chatroom_persona_authors
  FOR SELECT TO authenticated
  USING (public.is_world_member(world_id, (SELECT auth.uid())));

-- Un message public d'un persona l'inscrit ; le dernier qui disparaît (ou
-- change de persona, ou devient privé) l'efface. Déclencheur AFTER : la
-- table des messages montre déjà le changement, il suffit de voir s'il
-- reste un message public de ce persona dans ce salon.
CREATE OR REPLACE FUNCTION public.tg_chatroom_persona_authors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND OLD.persona_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.chat_messages m
        WHERE m.chat_id = OLD.chat_id
          AND m.persona_id = OLD.persona_id
          AND m.visible_to IS NULL
     ) THEN
    DELETE FROM public.chatroom_persona_authors
     WHERE chat_id = OLD.chat_id AND persona_id = OLD.persona_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.persona_id IS NOT NULL
     AND NEW.visible_to IS NULL
     AND NEW.world_id IS NOT NULL THEN
    INSERT INTO public.chatroom_persona_authors (chat_id, persona_id, world_id)
    VALUES (NEW.chat_id, NEW.persona_id, NEW.world_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_chatroom_persona_authors() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chatroom_persona_authors ON public.chat_messages;
CREATE TRIGGER trg_chatroom_persona_authors
  AFTER INSERT OR UPDATE OF persona_id, visible_to, chat_id OR DELETE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_chatroom_persona_authors();

-- Les messages déjà écrits.
INSERT INTO public.chatroom_persona_authors (chat_id, persona_id, world_id)
SELECT DISTINCT m.chat_id, m.persona_id, m.world_id
  FROM public.chat_messages m
  JOIN public.chatrooms c ON c.id = m.chat_id
  JOIN public.personas p ON p.id = m.persona_id
 WHERE m.persona_id IS NOT NULL
   AND m.visible_to IS NULL
   AND m.world_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- La fonction lit la table ; même signature, même résultat pour les
-- messages publics.
CREATE OR REPLACE FUNCTION public.get_chatroom_personas(p_world_id uuid)
RETURNS TABLE (chat_id uuid, persona_id uuid, persona_name text, group_color text)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT a.chat_id, a.persona_id, p.name, g.color
    FROM public.chatroom_persona_authors a
    JOIN public.chatrooms c ON c.id = a.chat_id AND c.timeline_date IS NOT NULL
    JOIN public.personas p ON p.id = a.persona_id
    LEFT JOIN public.persona_group_assignments ga ON ga.persona_id = a.persona_id AND ga.world_id = a.world_id
    LEFT JOIN public.world_persona_groups g ON g.id = ga.group_id
   WHERE a.world_id = p_world_id;
$$;

-- L'index de la migration 198 ne sert plus qu'à cette fonction, qui ne lit
-- plus les messages.
DROP INDEX IF EXISTS public.chat_messages_world_chat_persona_idx;
