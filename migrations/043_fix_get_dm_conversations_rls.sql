-- SECURITY FIX : get_dm_conversations est SECURITY DEFINER (bypass RLS) et n'avait
-- aucune clause WHERE. Sans filtre explicite, la fonction retournait toutes les
-- conversations de la table, permettant à un joueur de voir les échanges d'autres joueurs.
-- Correctif : filtrer sur participant_a / participant_b = auth.uid().

create or replace function get_dm_conversations()
returns table (
  id                     uuid,
  other_user_id          uuid,
  other_username         text,
  other_avatar_url       text,
  last_message_at        timestamptz,
  created_at             timestamptz,
  last_message_content   text,
  last_message_author_id uuid,
  unread_count           bigint
) language sql stable security definer as $$
  select
    c.id,
    case when c.participant_a = (select auth.uid()) then c.participant_b else c.participant_a end as other_user_id,
    p.username  as other_username,
    p.avatar_url as other_avatar_url,
    c.last_message_at,
    c.created_at,
    (
      select msg.content from dm_messages msg
      where msg.conversation_id = c.id
      order by msg.created_at desc limit 1
    ) as last_message_content,
    (
      select msg.author_id from dm_messages msg
      where msg.conversation_id = c.id
      order by msg.created_at desc limit 1
    ) as last_message_author_id,
    (
      select count(*) from dm_messages msg
      where msg.conversation_id = c.id
        and msg.author_id != (select auth.uid())
        and msg.created_at > coalesce(
          (select r.last_read_at from dm_reads r
           where r.conversation_id = c.id and r.user_id = (select auth.uid())),
          '1970-01-01'::timestamptz
        )
    ) as unread_count
  from dm_conversations c
  join profiles p on p.id = case
    when c.participant_a = (select auth.uid()) then c.participant_b
    else c.participant_a
  end
  -- Filtre explicite requis car SECURITY DEFINER bypass le RLS
  where c.participant_a = (select auth.uid())
     or c.participant_b = (select auth.uid())
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;
