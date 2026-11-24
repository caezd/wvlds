-- 243 — Chatbox : une salle réservée à un groupe de personas.
--
-- Une salle personnalisée (`world_live_channels`, migration 238) peut être
-- liée à un groupe de personas du monde (`group_id`). Elle n'est alors
-- visible — elle et ses messages — que par :
--   - les membres qui possèdent un persona (non supprimé) de ce groupe ou de
--     l'un de ses sous-groupes, comme pour les salons privés (migration 232) ;
--   - qui gère les paramètres du monde (`world.settings`), pour la régler.
-- Sans groupe, rien ne change : tous les membres la voient.
--
-- Supprimer le groupe supprime la salle et ses messages (ON DELETE CASCADE).
--
-- Temps réel (canal privé `world:<id>`) : comme le fil d'un salon, un
-- message d'une salle de groupe part SANS son contenu, et une salle de
-- groupe (ou qui vient de l'être) SANS sa ligne : le client relit avec ses
-- propres droits.

-- ── 1. Le groupe d'une salle ─────────────────────────────────
ALTER TABLE public.world_live_channels
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.world_persona_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS world_live_channels_group_idx
  ON public.world_live_channels (group_id) WHERE group_id IS NOT NULL;

-- Le groupe appartient au monde de la salle.
CREATE OR REPLACE FUNCTION public.tg_world_live_channel_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.world_persona_groups g WHERE g.id = NEW.group_id AND g.world_id = NEW.world_id
  ) THEN
    RAISE EXCEPTION 'Ce groupe n''appartient pas au monde.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.tg_world_live_channel_group() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS world_live_channel_group ON public.world_live_channels;
CREATE TRIGGER world_live_channel_group
  BEFORE INSERT OR UPDATE OF group_id, world_id ON public.world_live_channels
  FOR EACH ROW EXECUTE FUNCTION public.tg_world_live_channel_group();

-- ── 2. Qui voit une salle de groupe ──────────────────────────
-- L'utilisateur courant (auth.uid()) : pas de paramètre d'utilisateur, pour
-- qu'on ne puisse pas sonder les personas d'un autre. SECURITY DEFINER : les
-- affectations et les personas se lisent ici sans dépendre de leur RLS.
CREATE OR REPLACE FUNCTION public.can_see_live_channel_group(p_world uuid, p_group uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT p_group IS NULL
      OR ((select auth.uid()) IS NOT NULL AND (
           public.has_world_permission(p_world, (select auth.uid()), 'world.settings')
           OR EXISTS (
             SELECT 1
               FROM public.persona_group_subtree(p_group) s(id)
               JOIN public.persona_group_assignments a ON a.group_id = s.id
               JOIN public.personas p ON p.id = a.persona_id
              WHERE p.deleted_at IS NULL
                AND p.world_id = p_world
                AND public.owns_persona(p.id, (select auth.uid()))
           )
         ));
$function$;
REVOKE ALL ON FUNCTION public.can_see_live_channel_group(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_live_channel_group(uuid, uuid) TO authenticated;

ALTER POLICY world_live_channels_select ON public.world_live_channels
  USING (
    public.is_world_member(world_id, (select auth.uid()))
    AND (group_id IS NULL OR public.can_see_live_channel_group(world_id, group_id))
  );

-- ── 3. Les messages suivent la salle ─────────────────────────
-- En invocateur : le message d'une salle se lit (et s'écrit) si la salle se
-- lit, sous sa propre RLS.
ALTER POLICY world_live_messages_select ON public.world_live_messages
  USING (
    public.is_world_member(world_live_messages.world_id, (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.worlds w
       WHERE w.id = world_live_messages.world_id AND w.enable_live_chat
    )
    AND (
      world_live_messages.chatroom_id IS NULL
      OR EXISTS (SELECT 1 FROM public.chatrooms r WHERE r.id = world_live_messages.chatroom_id)
    )
    AND (
      world_live_messages.channel_id IS NULL
      OR EXISTS (SELECT 1 FROM public.world_live_channels c WHERE c.id = world_live_messages.channel_id)
    )
  );

ALTER POLICY world_live_messages_insert ON public.world_live_messages
  WITH CHECK (
    user_id = (select auth.uid())
    AND public.is_world_member(world_live_messages.world_id, (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.worlds w
       WHERE w.id = world_live_messages.world_id AND w.enable_live_chat
    )
    AND (
      world_live_messages.chatroom_id IS NULL
      OR EXISTS (SELECT 1 FROM public.chatrooms r WHERE r.id = world_live_messages.chatroom_id)
    )
    AND (
      world_live_messages.channel_id IS NULL
      OR EXISTS (SELECT 1 FROM public.world_live_channels c WHERE c.id = world_live_messages.channel_id)
    )
  );

-- ── 4. Temps réel ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_world_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.wvlds_notify('world:' || OLD.world_id::text, 'live',
      jsonb_build_object('op', TG_OP, 'id', OLD.id, 'channel_id', OLD.channel_id, 'chatroom_id', OLD.chatroom_id));
  ELSIF NEW.chatroom_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.world_live_channels c WHERE c.id = NEW.channel_id AND c.group_id IS NOT NULL
  ) THEN
    -- Fil d'un salon, salle d'un groupe : l'avis seul ; le client relit (RLS).
    PERFORM public.wvlds_notify('world:' || NEW.world_id::text, 'live',
      jsonb_build_object('op', TG_OP, 'id', NEW.id, 'channel_id', NEW.channel_id, 'chatroom_id', NEW.chatroom_id));
  ELSE
    PERFORM public.wvlds_notify('world:' || NEW.world_id::text, 'live',
      jsonb_build_object('op', TG_OP, 'record', to_jsonb(NEW)));
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.broadcast_world_live_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.wvlds_notify('world:' || OLD.world_id::text, 'live_channels',
      jsonb_build_object('op', TG_OP, 'id', OLD.id));
  ELSIF NEW.group_id IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.group_id IS NOT NULL) THEN
    -- Salle d'un groupe, ou qui vient de l'être : l'avis seul ; le client
    -- relit la liste avec ses droits.
    PERFORM public.wvlds_notify('world:' || NEW.world_id::text, 'live_channels',
      jsonb_build_object('op', TG_OP, 'id', NEW.id));
  ELSE
    PERFORM public.wvlds_notify('world:' || NEW.world_id::text, 'live_channels',
      jsonb_build_object('op', TG_OP, 'record', to_jsonb(NEW)));
  END IF;
  RETURN NULL;
END;
$function$;

-- ── Retour arrière ───────────────────────────────────────────
-- Remettre les politiques et les deux fonctions de diffusion de la
-- migration 238, puis :
-- DROP TRIGGER world_live_channel_group ON public.world_live_channels;
-- DROP FUNCTION public.tg_world_live_channel_group(), public.can_see_live_channel_group(uuid, uuid);
-- ALTER TABLE public.world_live_channels DROP COLUMN group_id;
