-- Centre de recherche de messages (façon Discord) : filtrage sur métadonnées
-- non chiffrées de chat_messages. Le contenu (`content`) reste chiffré côté
-- client (AES-256-GCM, cf. lib/crypto.ts) : cette fonction ne filtre jamais
-- sur le texte des messages, seulement sur salon/auteur/date/épinglé/pièce
-- jointe. La recherche texte libre / mentions se fait côté client après
-- déchiffrement, en rappelant cette fonction par lots successifs.

-- Index manquant pour le calcul de `pinned` par ligne (chat_pins n'avait
-- qu'un index sur (chat_id, created_at), pas sur message_id).
create index if not exists chat_pins_message_id_idx on public.chat_pins (message_id);

create or replace function public.search_chat_messages(
  p_world_id uuid,
  p_chat_ids uuid[] default null,
  p_author_ids uuid[] default null,
  p_persona_ids uuid[] default null,
  p_author_mode text default null, -- 'persona' | 'direct' | null
  p_has_media boolean default null,
  p_pinned boolean default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id bigint default null,
  p_limit integer default 50
)
returns table (
  id bigint,
  chat_id uuid,
  author_id uuid,
  persona_id uuid,
  content text,
  created_at timestamptz,
  metadata jsonb,
  pinned boolean
)
language sql
stable
as $$
  -- SECURITY INVOKER (par défaut) : la policy RLS "messages select if world
  -- member" sur chat_messages s'applique déjà telle quelle, pas besoin de
  -- réimplémenter la vérification de membership ici.
  select
    m.id,
    m.chat_id,
    m.author_id,
    m.persona_id,
    m.content,
    m.created_at,
    m.metadata,
    exists (
      select 1 from public.chat_pins p where p.message_id = m.id
    ) as pinned
  from public.chat_messages m
  where m.world_id = p_world_id
    and (p_chat_ids is null or m.chat_id = any (p_chat_ids))
    and (p_author_ids is null or m.author_id = any (p_author_ids))
    and (p_persona_ids is null or m.persona_id = any (p_persona_ids))
    and (
      p_author_mode is null
      or (p_author_mode = 'persona' and m.persona_id is not null)
      or (p_author_mode = 'direct' and m.persona_id is null)
    )
    and (
      p_has_media is null
      or p_has_media = (jsonb_array_length(coalesce(m.metadata -> 'media', '[]'::jsonb)) > 0)
    )
    and (
      p_pinned is null
      or p_pinned = exists (select 1 from public.chat_pins p where p.message_id = m.id)
    )
    and (p_date_from is null or m.created_at >= p_date_from)
    and (p_date_to is null or m.created_at <= p_date_to)
    and (
      p_cursor_created_at is null
      or (m.created_at, m.id) < (p_cursor_created_at, coalesce(p_cursor_id, 0))
    )
  order by m.created_at desc, m.id desc
  limit p_limit;
$$;

revoke all on function public.search_chat_messages(
  uuid, uuid[], uuid[], uuid[], text, boolean, boolean, timestamptz, timestamptz, timestamptz, bigint, integer
) from public;
revoke all on function public.search_chat_messages(
  uuid, uuid[], uuid[], uuid[], text, boolean, boolean, timestamptz, timestamptz, timestamptz, bigint, integer
) from anon;
grant execute on function public.search_chat_messages(
  uuid, uuid[], uuid[], uuid[], text, boolean, boolean, timestamptz, timestamptz, timestamptz, bigint, integer
) to authenticated;

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.search_chat_messages(uuid, uuid[], uuid[], uuid[], text, boolean, boolean, timestamptz, timestamptz, timestamptz, bigint, integer);
-- DROP INDEX IF EXISTS public.chat_pins_message_id_idx;
