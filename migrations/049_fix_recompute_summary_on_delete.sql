-- Migration 049 — fix recompute_summary_on_delete
-- La fonction ne récupérait pas l'avatar du persona lors du recalcul
-- après suppression d'un message : elle utilisait uniquement profiles.avatar_url,
-- qui est souvent null si l'utilisateur n'utilise que des personas.
-- Fix : COALESCE(persona.avatar_url, profile.avatar_url).

CREATE OR REPLACE FUNCTION public.recompute_summary_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_last            record;
  v_author_username text;
  v_author_avatar   text;
  v_persona_name    text;
  v_persona_avatar  text;
begin
  select m.* into v_last
  from public.chat_messages m
  where m.chat_id = old.chat_id
  order by m.created_at desc, m.id desc
  limit 1;

  if v_last is not null then
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
