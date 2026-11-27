-- ──────────────────────────────────────────────────────────────────────────
-- 276 — Supprimer un salon au complet.
--
-- `chatrooms` n'avait aucune policy DELETE : « Supprimer la salle » touchait
-- zéro ligne, sans erreur. Qui gère le salon (son créateur, ou
-- `chatrooms.manage` dans le monde — `can_manage_chatroom_access`) peut
-- désormais le supprimer.
--
-- Tout part avec lui : messages, lancers, ellipses, épingles, tours, lectures,
-- résumés… le faisaient déjà en cascade ; les notifications du salon aussi
-- désormais (elles restaient, orphelines). Les virements du monde gardent
-- leur ligne (`chat_id` remis à nul) : c'est le registre de l'économie.
--
-- En cascade, chaque message supprimé relançait le recalcul du résumé du
-- salon, la liste des auteurs et une diffusion temps réel : autant de
-- travail par message pour un salon qui disparaît. Ces déclencheurs
-- s'arrêtent quand le salon n'existe plus ; le monde apprend la suppression
-- par `broadcast_world_chatroom`, une fois.
--
-- Les fichiers (icône, bannière, médias et bannières des messages) sont
-- effacés par l'action serveur `deleteChatroom`, par l'API de stockage.
-- ──────────────────────────────────────────────────────────────────────────

-- ── La policy ───────────────────────────────────────────────
DROP POLICY IF EXISTS "chatrooms: managers delete" ON public.chatrooms;
CREATE POLICY "chatrooms: managers delete" ON public.chatrooms
  FOR DELETE TO authenticated
  USING (public.can_manage_chatroom_access(id, (SELECT auth.uid())));

-- ── Les notifications partent avec le salon ─────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_chat_id_fkey,
  ADD CONSTRAINT notifications_chat_id_fkey
    FOREIGN KEY (chat_id) REFERENCES public.chatrooms(id) ON DELETE CASCADE;

-- ── Les déclencheurs par message s'arrêtent avec le salon ───
CREATE OR REPLACE FUNCTION public.recompute_summary_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_last            record;
  v_author_username text;
  v_author_avatar   text;
  v_persona_name    text;
  v_persona_avatar  text;
begin
  -- Le salon entier part (cascade) : rien à recalculer.
  if not exists (select 1 from public.chatrooms c where c.id = old.chat_id) then
    return old;
  end if;

  select m.* into v_last
  from public.chat_messages m
  where m.chat_id = old.chat_id
  order by m.created_at desc, m.id desc
  limit 1;

  if found then
    select p.username, p.avatar_url
      into v_author_username, v_author_avatar
    from public.profiles p
    where p.id = v_last.author_id;

    if v_last.persona_id is not null then
      select pe.name, pe.avatar_url
        into v_persona_name, v_persona_avatar
      from public.personas pe
      where pe.id = v_last.persona_id;
    end if;

    update public.chatroom_summaries s set
      last_message_id               = v_last.id,
      last_message_at               = v_last.created_at,
      last_message_excerpt          = public.msg_excerpt(v_last.content, 140),
      last_message_author_id        = v_last.author_id,
      last_message_author_username  = v_author_username,
      last_message_persona_avatar_url = COALESCE(v_persona_avatar, v_author_avatar),
      last_message_persona_id       = v_last.persona_id,
      last_message_persona_name     = v_persona_name
    where s.chat_id = old.chat_id;

    update public.chatrooms c set updated_at = v_last.created_at where c.id = old.chat_id;
  else
    delete from public.chatroom_summaries where chat_id = old.chat_id;
  end if;

  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_chatroom_persona_authors()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Le salon entier part (cascade) : ses auteurs partent avec lui.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.chatrooms c WHERE c.id = OLD.chat_id) THEN
    RETURN NULL;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.broadcast_room_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r public.chat_messages%ROWTYPE;
  destinataire uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  -- Le salon entier part (cascade) : pas une diffusion par message.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.chatrooms c WHERE c.id = r.chat_id) THEN
    RETURN NULL;
  END IF;
  IF r.visible_to IS NULL THEN
    PERFORM realtime.send(
      jsonb_build_object('op', TG_OP, 'id', r.id, 'author_id', r.author_id),
      'message', 'room:' || r.chat_id::text, true);
  ELSE
    FOREACH destinataire IN ARRAY r.visible_to LOOP
      PERFORM realtime.send(
        jsonb_build_object('op', TG_OP, 'id', r.id, 'chat_id', r.chat_id, 'author_id', r.author_id),
        'room_message', 'msgs:' || destinataire::text, true);
    END LOOP;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_room_message : %', SQLERRM;
  RETURN NULL;
END;
$function$;
