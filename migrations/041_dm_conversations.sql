-- ── Direct Messages ──────────────────────────────────────────────────────────
-- Tables : dm_conversations, dm_messages, dm_reads
-- RPC    : find_or_create_dm, get_dm_conversations, count_common_worlds

-- dm_conversations : une ligne par paire de joueurs (participant_a < participant_b)
create table dm_conversations (
  id             uuid primary key default gen_random_uuid(),
  participant_a  uuid not null references profiles(id) on delete cascade,
  participant_b  uuid not null references profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at     timestamptz default now() not null,
  constraint dm_conversations_ordered check (participant_a < participant_b),
  constraint dm_conversations_unique_pair unique (participant_a, participant_b)
);

create index dm_conversations_participant_a_idx on dm_conversations (participant_a);
create index dm_conversations_participant_b_idx on dm_conversations (participant_b);

-- dm_messages
create table dm_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references dm_conversations(id) on delete cascade,
  author_id       uuid not null references profiles(id) on delete cascade,
  content         text not null check (length(trim(content)) > 0 and length(content) <= 4000),
  created_at      timestamptz default now() not null
);

create index dm_messages_conversation_idx on dm_messages (conversation_id, created_at desc);

-- dm_reads : suivi de la dernière lecture par conversation
create table dm_reads (
  conversation_id uuid not null references dm_conversations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  last_read_at    timestamptz not null,
  primary key (conversation_id, user_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table dm_conversations enable row level security;
alter table dm_messages      enable row level security;
alter table dm_reads         enable row level security;

create policy "dm_conv_select" on dm_conversations
  for select using (
    participant_a = (select auth.uid()) or participant_b = (select auth.uid())
  );

create policy "dm_conv_insert" on dm_conversations
  for insert with check (
    (participant_a = (select auth.uid()) or participant_b = (select auth.uid()))
    and participant_a < participant_b
  );

create policy "dm_messages_select" on dm_messages
  for select using (
    exists (
      select 1 from dm_conversations c
      where c.id = conversation_id
        and (c.participant_a = (select auth.uid()) or c.participant_b = (select auth.uid()))
    )
  );

create policy "dm_messages_insert" on dm_messages
  for insert with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from dm_conversations c
      where c.id = conversation_id
        and (c.participant_a = (select auth.uid()) or c.participant_b = (select auth.uid()))
    )
  );

create policy "dm_reads_select" on dm_reads
  for select using (user_id = (select auth.uid()));

create policy "dm_reads_upsert" on dm_reads
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── Réplication realtime ──────────────────────────────────────────────────────

alter publication supabase_realtime add table dm_messages;

-- ── RPC : trouver ou créer une conversation ───────────────────────────────────

create or replace function find_or_create_dm(p_other_user_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_me     uuid := (select auth.uid());
  v_a      uuid;
  v_b      uuid;
  v_id     uuid;
begin
  if v_me = p_other_user_id then
    raise exception 'Cannot open a DM with yourself';
  end if;

  if v_me < p_other_user_id then
    v_a := v_me; v_b := p_other_user_id;
  else
    v_a := p_other_user_id; v_b := v_me;
  end if;

  select id into v_id from dm_conversations
  where participant_a = v_a and participant_b = v_b;

  if v_id is null then
    insert into dm_conversations (participant_a, participant_b)
    values (v_a, v_b) returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- ── RPC : liste des conversations avec profil de l'autre joueur ───────────────

create or replace function get_dm_conversations()
returns table (
  id                    uuid,
  other_user_id         uuid,
  other_username        text,
  other_avatar_url      text,
  last_message_at       timestamptz,
  created_at            timestamptz,
  last_message_content  text,
  last_message_author_id uuid,
  unread_count          bigint
) language sql stable security definer as $$
  select
    c.id,
    case when c.participant_a = (select auth.uid()) then c.participant_b else c.participant_a end as other_user_id,
    p.username as other_username,
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
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

-- ── RPC : nombre de mondes en commun ─────────────────────────────────────────

create or replace function count_common_worlds(p_other_user_id uuid)
returns bigint language sql stable security definer as $$
  select count(*)
  from world_members wm1
  join world_members wm2 on wm1.world_id = wm2.world_id
  where wm1.user_id = (select auth.uid()) and wm2.user_id = p_other_user_id;
$$;

-- ── Feature flag ──────────────────────────────────────────────────────────────

insert into feature_flags (key, enabled) values ('direct_messages', false)
on conflict (key) do nothing;
